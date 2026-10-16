import { z } from "zod";
import { hash, HttpError, random } from "./security";
import { EncryptedStore } from "./encryption";

export const appSchema = z.object({
  id: z.number(),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  client_id: z.string(),
  client_secret: z.string().min(1),
  pem: z.string().min(1),
  webhook_secret: z.string().min(1),
  owner: z.object({ login: z.string() }),
  origin: z.url(),
  allowedTeam: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,99}$/)
    .optional(),
});
export type App = z.infer<typeof appSchema>;
export const credentialsSchema = z.object({
  accessToken: z.string().min(1),
  accessExpires: z.number(),
  refreshToken: z.string().optional(),
  refreshExpires: z.number().optional(),
});
export type Credentials = z.infer<typeof credentialsSchema>;
export interface Session {
  id: string;
  userId: number;
  csrf: string;
  expires: number;
  credentials: Credentials;
}
export interface Workspace {
  displayName?: string;
  organization: string;
  repository: string;
  vault: string;
  installationId: number;
  openRegistration: boolean;
  memberPrivateChannels: boolean;
  nonce: string;
  ready: boolean;
}
const schema = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS states (id TEXT PRIMARY KEY, kind TEXT NOT NULL, value TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, csrf TEXT NOT NULL, value TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS workspaces (organization TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS locks (id TEXT PRIMARY KEY, owner TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
`;

export class Store extends EncryptedStore {
  constructor(
    private db: D1Database,
    secret: string,
  ) {
    super(secret);
  }
  async initialize() {
    try {
      await this.db.prepare("SELECT key FROM settings LIMIT 1").all();
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("no such table"))
        throw error;
      await this.db.exec(schema);
    }
  }
  async app(): Promise<App | null> {
    const row = await this.db
      .prepare("SELECT value FROM settings WHERE key='app'")
      .first<{ value: string }>();
    return row ? appSchema.parse(await this.open(row.value, "app")) : null;
  }
  async register(app: App) {
    await this.db
      .prepare("INSERT INTO settings(key,value) VALUES('app',?)")
      .bind(await this.seal(app, "app"))
      .run();
  }
  async state(kind: string, value: unknown) {
    const id = random();
    await this.prune();
    await this.db
      .prepare("INSERT INTO states VALUES(?,?,?,?)")
      .bind(
        id,
        kind,
        await this.seal(value, "state:" + id),
        Date.now() + 600_000,
      )
      .run();
    return id;
  }
  async consume(id: string, kind: string) {
    const row = await this.db
      .prepare(
        "DELETE FROM states WHERE id=? AND kind=? AND expires>? RETURNING value",
      )
      .bind(id, kind, Date.now())
      .first<{ value: string }>();
    if (!row)
      throw new HttpError(
        400,
        "This request expired or has already been used. Start again.",
      );
    return this.open(row.value, "state:" + id);
  }
  // Diagnostic snapshots contain only this browser's own access results.
  // OAuth/setup state continues to use the single-use consume method.
  async readAccess(id: string) {
    if (!/^[a-f0-9]{64}$/.test(id))
      throw new HttpError(401, "Sign in to check your access.");
    const row = await this.db
      .prepare(
        "SELECT value FROM states WHERE id=? AND kind='access' AND expires>?",
      )
      .bind(id, Date.now())
      .first<{ value: string }>();
    if (!row)
      throw new HttpError(401, "Your access check expired. Sign in again.");
    return this.open(row.value, "state:" + id);
  }
  async createSession(userId: number, credentials: Credentials) {
    const raw = random(),
      id = await hash(raw),
      csrf = random(),
      expires = Date.now() + 7 * 86400_000;
    await this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?,?,?)")
      .bind(
        id,
        userId,
        csrf,
        await this.seal(credentials, "session:" + id),
        expires,
      )
      .run();
    return { raw, session: { id, userId, csrf, expires, credentials } };
  }
  async session(raw: string): Promise<Session> {
    if (!/^[a-f0-9]{64}$/.test(raw))
      throw new HttpError(401, "Sign in to continue.");
    const id = await hash(raw);
    const row = await this.db
      .prepare(
        "SELECT user_id,csrf,value,expires FROM sessions WHERE id=? AND expires>?",
      )
      .bind(id, Date.now())
      .first<{
        user_id: number;
        csrf: string;
        value: string;
        expires: number;
      }>();
    if (!row) throw new HttpError(401, "Your session expired. Sign in again.");
    return {
      id,
      userId: row.user_id,
      csrf: row.csrf,
      expires: row.expires,
      credentials: credentialsSchema.parse(
        await this.open(row.value, "session:" + id),
      ),
    };
  }
  async saveSession(session: Session) {
    await this.db
      .prepare("UPDATE sessions SET value=? WHERE id=? AND expires>?")
      .bind(
        await this.seal(session.credentials, "session:" + session.id),
        session.id,
        Date.now(),
      )
      .run();
  }
  async reloadCredentials(id: string) {
    const row = await this.db
      .prepare("SELECT value FROM sessions WHERE id=? AND expires>?")
      .bind(id, Date.now())
      .first<{ value: string }>();
    if (!row) throw new HttpError(401, "Your session expired. Sign in again.");
    return credentialsSchema.parse(await this.open(row.value, "session:" + id));
  }
  async logout(id: string) {
    await this.db.prepare("DELETE FROM sessions WHERE id=?").bind(id).run();
  }
  async revoke(userId: number) {
    await this.db
      .prepare("DELETE FROM sessions WHERE user_id=?")
      .bind(userId)
      .run();
  }
  async workspace(organization: string): Promise<Workspace | null> {
    const row = await this.db
      .prepare("SELECT value FROM workspaces WHERE organization=?")
      .bind(organization.toLowerCase())
      .first<{ value: string }>();
    return row ? JSON.parse(row.value) : null;
  }
  async saveWorkspace(workspace: Workspace) {
    await this.db
      .prepare(
        "INSERT INTO workspaces VALUES(?,?) ON CONFLICT(organization) DO UPDATE SET value=excluded.value",
      )
      .bind(workspace.organization.toLowerCase(), JSON.stringify(workspace))
      .run();
  }
  async defaultWorkspace() {
    const row = await this.db
      .prepare(
        "SELECT value FROM workspaces WHERE json_extract(value,'$.ready')=1 ORDER BY organization LIMIT 1",
      )
      .first<{ value: string }>();
    return row ? (JSON.parse(row.value) as Workspace) : null;
  }
  async locked<T>(id: string, action: () => Promise<T>): Promise<T> {
    const owner = random();
    const result = await this.db
      .prepare(
        "INSERT INTO locks VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,expires=excluded.expires WHERE locks.expires<? RETURNING owner",
      )
      .bind(id, owner, Date.now() + 90_000, Date.now())
      .first<{ owner: string }>();
    if (result?.owner !== owner)
      throw new HttpError(
        409,
        "Another workspace operation is in progress. Retry shortly.",
      );
    try {
      return await action();
    } finally {
      await this.db
        .prepare("DELETE FROM locks WHERE id=? AND owner=?")
        .bind(id, owner)
        .run();
    }
  }
  async rateLimit(request: Request, kind: string) {
    const now = Date.now(),
      id = await hash(
        this.secret +
          ":" +
          kind +
          ":" +
          (request.headers.get("CF-Connecting-IP") || "local") +
          ":" +
          Math.floor(now / 60_000),
      );
    const row = await this.db
      .prepare(
        "INSERT INTO limits VALUES(?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count",
      )
      .bind(id, now + 120_000)
      .first<{ count: number }>();
    if (!row || row.count > 10)
      throw new HttpError(
        429,
        "Too many sign-in attempts. Wait a minute and try again.",
      );
  }
  async prune() {
    await this.db.batch(
      ["states", "sessions", "limits", "locks"].map((table) =>
        this.db
          .prepare(`DELETE FROM ${table} WHERE expires<?`)
          .bind(Date.now()),
      ),
    );
  }
}

// A structural contract lets each platform supply durable storage.
export type BackendStore = Pick<Store, keyof Store>;
