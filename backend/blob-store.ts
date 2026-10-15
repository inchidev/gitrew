import { BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { z } from "zod";
import { EncryptedStore } from "./encryption";
import { boundedBytes, hash, HttpError, random } from "./security";
import {
  appSchema,
  credentialsSchema,
  type App,
  type BackendStore,
  type Credentials,
  type Session,
  type Workspace,
} from "./store";

const pathname = "gitrew/state-v1.enc";
const maxBytes = 2 * 1024 * 1024;
const expiresSchema = z.object({ expires: z.number() });
const snapshotSchema = z.object({
  version: z.literal(1),
  app: appSchema.nullable(),
  states: z.record(
    z.string(),
    expiresSchema.extend({ kind: z.string(), value: z.unknown() }),
  ),
  sessions: z.record(
    z.string(),
    expiresSchema.extend({
      id: z.string(),
      userId: z.number(),
      csrf: z.string(),
      credentials: credentialsSchema,
    }),
  ),
  workspaces: z.record(
    z.string(),
    z.object({
      organization: z.string(),
      repository: z.string(),
      vault: z.string(),
      installationId: z.number(),
      openRegistration: z.boolean(),
      memberPrivateChannels: z.boolean(),
      nonce: z.string(),
      ready: z.boolean(),
    }),
  ),
  locks: z.record(z.string(), expiresSchema.extend({ owner: z.string() })),
  limits: z.record(z.string(), expiresSchema.extend({ count: z.number() })),
});
type Snapshot = z.infer<typeof snapshotSchema>;
const empty = (): Snapshot => ({
  version: 1,
  app: null,
  states: {},
  sessions: {},
  workspaces: {},
  locks: {},
  limits: {},
});

export interface BlobSnapshotTransport {
  read(): Promise<{ value: string; etag: string } | null>;
  // An absent ETag means create-only. Existing snapshots require compare-and-swap.
  write(value: string, etag?: string): Promise<unknown>;
}

export function privateBlobTransport(
  token?: string,
  storeId?: string,
): BlobSnapshotTransport {
  return {
    async read() {
      const blob = await get(pathname, {
        access: "private",
        useCache: false,
        // Compression changes a strong origin ETag into a weak CDN validator,
        // which Blob correctly rejects for ifMatch conditional writes.
        headers: { "accept-encoding": "identity" },
        token,
        storeId,
        abortSignal: AbortSignal.timeout(20_000),
      });
      if (!blob) return null;
      if (blob.statusCode !== 200)
        throw new HttpError(
          503,
          "Private storage did not return the current configuration.",
        );
      const bytes = await boundedBytes(new Response(blob.stream), maxBytes);
      return { value: new TextDecoder().decode(bytes), etag: blob.blob.etag };
    },
    write(value, etag) {
      return put(pathname, value, {
        access: "private",
        token,
        storeId,
        addRandomSuffix: false,
        allowOverwrite: Boolean(etag),
        ifMatch: etag,
        contentType: "application/octet-stream",
        cacheControlMaxAge: 60,
        abortSignal: AbortSignal.timeout(20_000),
      });
    },
  };
}

// A small, encrypted metadata snapshot for an independently hosted team.
// Messages remain in GitHub. ETags coordinate writes across function instances;
// no correctness decisions depend on process memory or CDN-cached reads.
export class BlobStore extends EncryptedStore implements BackendStore {
  constructor(
    secret: string,
    private transport: BlobSnapshotTransport,
  ) {
    super(secret);
  }
  private async read() {
    const blob = await this.transport.read();
    return {
      data: blob
        ? snapshotSchema.parse(await this.open(blob.value, pathname))
        : empty(),
      etag: blob?.etag,
    };
  }
  async initialize() {
    const current = await this.read();
    if (current.etag || this.secret.length < 32) return;
    try {
      await this.transport.write(await this.seal(empty(), pathname));
    } catch (error) {
      // Another cold start may have created it. Verify rather than overwrite.
      if (!(await this.read()).etag) throw error;
    }
  }
  private pruneSnapshot(data: Snapshot) {
    for (const collection of [
      data.states,
      data.sessions,
      data.locks,
      data.limits,
    ])
      for (const [key, value] of Object.entries(collection))
        if (value.expires <= Date.now()) delete collection[key];
  }
  private async update<T>(change: (data: Snapshot) => T): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const { data, etag } = await this.read();
      if (!etag)
        throw new HttpError(
          503,
          "Private storage is unavailable. Reload setup.",
        );
      this.pruneSnapshot(data);
      const result = change(data);
      const value = await this.seal(data, pathname);
      if (Buffer.byteLength(value) > maxBytes)
        throw new HttpError(
          503,
          "This deployment has too many active sessions. Retry after older sessions expire.",
        );
      try {
        await this.transport.write(value, etag);
        return result;
      } catch (error) {
        if (!(error instanceof BlobPreconditionFailedError)) throw error;
      }
    }
    throw new HttpError(
      409,
      "Another workspace operation is in progress. Retry shortly.",
    );
  }
  async app() {
    return (await this.read()).data.app;
  }
  async register(app: App) {
    await this.update((data) => {
      if (data.app)
        throw new HttpError(409, "This deployment already has a GitHub App.");
      data.app = appSchema.parse(app);
    });
  }
  async state(kind: string, value: unknown) {
    const id = random();
    await this.update((data) => {
      data.states[id] = { kind, value, expires: Date.now() + 600_000 };
    });
    return id;
  }
  async consume(id: string, kind: string) {
    return this.update((data) => {
      const state = data.states[id];
      if (!state || state.kind !== kind)
        throw new HttpError(
          400,
          "This request expired or has already been used. Start again.",
        );
      delete data.states[id];
      return state.value;
    });
  }
  async createSession(userId: number, credentials: Credentials) {
    const raw = random(),
      id = await hash(raw);
    const session: Session = {
      id,
      userId,
      csrf: random(),
      expires: Date.now() + 7 * 86400_000,
      credentials,
    };
    await this.update((data) => {
      data.sessions[id] = session;
    });
    return { raw, session };
  }
  async session(raw: string): Promise<Session> {
    if (!/^[a-f0-9]{64}$/.test(raw))
      throw new HttpError(401, "Sign in to continue.");
    const session = (await this.read()).data.sessions[await hash(raw)];
    if (!session || session.expires <= Date.now())
      throw new HttpError(401, "Your session expired. Sign in again.");
    return session;
  }
  async saveSession(session: Session) {
    await this.update((data) => {
      const current = data.sessions[session.id];
      if (!current)
        throw new HttpError(401, "Your session expired. Sign in again.");
      current.credentials = credentialsSchema.parse(session.credentials);
    });
  }
  async reloadCredentials(id: string) {
    const session = (await this.read()).data.sessions[id];
    if (!session || session.expires <= Date.now())
      throw new HttpError(401, "Your session expired. Sign in again.");
    return session.credentials;
  }
  async logout(id: string) {
    await this.update((data) => {
      delete data.sessions[id];
    });
  }
  async revoke(userId: number) {
    await this.update((data) => {
      for (const [id, session] of Object.entries(data.sessions))
        if (session.userId === userId) delete data.sessions[id];
    });
  }
  async workspace(organization: string): Promise<Workspace | null> {
    const workspaces = (await this.read()).data.workspaces;
    const key = organization.toLowerCase();
    return Object.hasOwn(workspaces, key) ? workspaces[key]! : null;
  }
  async saveWorkspace(workspace: Workspace) {
    await this.update((data) => {
      data.workspaces[workspace.organization.toLowerCase()] = workspace;
    });
  }
  async defaultWorkspace(): Promise<Workspace | null> {
    return (
      Object.values((await this.read()).data.workspaces)
        .filter((w) => w.ready)
        .sort((a, b) => a.organization.localeCompare(b.organization))[0] ?? null
    );
  }
  async locked<T>(id: string, action: () => Promise<T>): Promise<T> {
    const owner = random();
    await this.update((data) => {
      if (data.locks[id])
        throw new HttpError(
          409,
          "Another workspace operation is in progress. Retry shortly.",
        );
      data.locks[id] = { owner, expires: Date.now() + 90_000 };
    });
    try {
      return await action();
    } finally {
      await this.update((data) => {
        if (data.locks[id]?.owner === owner) delete data.locks[id];
      });
    }
  }
  async rateLimit(request: Request, kind: string) {
    const now = Date.now();
    const id = await hash(
      this.secret +
        ":" +
        kind +
        ":" +
        (request.headers.get("CF-Connecting-IP") || "local") +
        ":" +
        Math.floor(now / 60_000),
    );
    const count = await this.update((data) => {
      const row = data.limits[id] ?? { count: 0, expires: now + 120_000 };
      data.limits[id] = row;
      return ++row.count;
    });
    if (count > 10)
      throw new HttpError(
        429,
        "Too many sign-in attempts. Wait a minute and try again.",
      );
  }
  async prune() {
    await this.update(() => {});
  }
}
