import { z } from "zod";
import { githubFetch } from "./backend";
import { newMailboxKey, type MailboxConfig } from "../../shared/mailbox.ts";

export interface SetupPlan {
  organization: string;
  clientUrl: string;
  ownClient: boolean;
  nonce: string;
  registrationState?: string;
  administrator: { id: number; login: string };
}
export const SETUP_KEY = "gitrew:setup:v1";
type RegistrationMaterial = {
  createdAt: number;
  nonce: string;
  app: {
    id: number;
    slug: string;
    client_id: string;
    pem: string;
    owner: { login: string };
  };
  key: Awaited<ReturnType<typeof newMailboxKey>>;
};
const materials = new Map<string, RegistrationMaterial>();
export async function adminApi(
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<any> {
  if (!path.startsWith("/") || path.startsWith("//"))
    throw new Error("Invalid GitHub API path.");
  const response = await githubFetch(path, token, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
    credentials: "omit",
    referrerPolicy: "no-referrer",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? "GitHub denied this installer operation. Check the Creator installation and organization policy."
        : `GitHub setup failed (${response.status}). Your existing repositories were preserved.`,
    );
  return response.status === 204 ? null : response.json();
}
export async function createWorkspaceRepositories(
  _token: string,
  _plan: SetupPlan,
  _onStep: (message: string) => void,
) {
  throw new Error(
    "The legacy Actions installer requires a public authentication mailbox and is retired. Deploy Gitrew on Cloudflare or celld and use /create/ to create private workspace repositories.",
  );
}

export async function putFile(
  token: string,
  repository: string,
  path: string,
  content: string,
) {
  const existing = await fetch(
    `https://api.github.com/repos/${repository}/contents/${path}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    },
  );
  if (existing.status !== 404 && !existing.ok)
    throw new Error("Could not inspect the setup file.");
  const sha = existing.ok ? (await existing.json()).sha : undefined;
  const bytes = new TextEncoder().encode(content);
  const encoded = btoa(
    Array.from(bytes, (c) => String.fromCharCode(c)).join(""),
  );
  return adminApi(token, `/repos/${repository}/contents/${path}`, "PUT", {
    message: `Configure Gitrew: ${path}`,
    content: encoded,
    ...(sha ? { sha } : {}),
  });
}
async function putSecret(
  token: string,
  repository: string,
  name: string,
  value: string,
) {
  const { default: sodium } = await import("libsodium-wrappers");
  const key = await adminApi(
    token,
    `/repos/${repository}/actions/secrets/public-key`,
  );
  await sodium.ready;
  const encrypted = sodium.crypto_box_seal(
    new TextEncoder().encode(value),
    sodium.from_base64(key.key, sodium.base64_variants.ORIGINAL),
  );
  await adminApi(token, `/repos/${repository}/actions/secrets/${name}`, "PUT", {
    key_id: key.key_id,
    encrypted_value: sodium.to_base64(
      encrypted,
      sodium.base64_variants.ORIGINAL,
    ),
  });
}
export function beginAppRegistration(plan: SetupPlan) {
  const state = crypto.randomUUID();
  sessionStorage.setItem(
    SETUP_KEY,
    JSON.stringify({ ...plan, registrationState: state }),
  );
  const redirect = new URL(window.location.href);
  redirect.search = "";
  redirect.hash = "";
  redirect.searchParams.set("setup", state);
  const manifest = {
    name: `Gitrew ${plan.organization}`,
    url: plan.clientUrl,
    redirect_url: redirect.href,
    callback_urls: [plan.clientUrl],
    setup_url: redirect.origin + redirect.pathname,
    hook_attributes: {
      url: new URL("unused-webhook", plan.clientUrl).href,
      active: false,
    },
    public: false,
    default_permissions: {
      contents: "write",
      discussions: "write",
      issues: "write",
      metadata: "read",
      pull_requests: "read",
      organization_projects: "read",
    },
    default_events: [],
  };
  const form = document.createElement("form");
  form.method = "POST";
  form.action = `https://github.com/organizations/${plan.organization}/settings/apps/new?state=${state}`;
  const field = document.createElement("input");
  field.type = "hidden";
  field.name = "manifest";
  field.value = JSON.stringify(manifest);
  form.append(field);
  document.body.append(form);
  form.submit();
}
export async function finishAppRegistration(
  token: string,
  plan: SetupPlan,
  code: string,
  baseURL: string,
  onStep: (message: string) => void,
): Promise<MailboxConfig> {
  onStep("Registering your workspace App…");
  let material = materials.get(plan.nonce);
  if (!material && typeof sessionStorage !== "undefined") {
    try {
      material =
        JSON.parse(sessionStorage.getItem("gitrew:setup-material") || "null") ||
        undefined;
    } catch {
      /* Invalid local recovery data is ignored. */
    }
  }
  if (
    material &&
    (material.nonce !== plan.nonce ||
      Date.now() - material.createdAt > 1_800_000)
  ) {
    material = undefined;
    if (typeof sessionStorage !== "undefined")
      sessionStorage.removeItem("gitrew:setup-material");
  }
  if (!material) {
    const response = await fetch(
      `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
      {
        method: "POST",
        headers: { Accept: "application/vnd.github+json" },
        credentials: "omit",
        referrerPolicy: "no-referrer",
      },
    );
    if (!response.ok)
      throw new Error(
        "App registration expired. Start the registration step again.",
      );
    const app = z
      .object({
        id: z.number(),
        slug: z.string(),
        client_id: z.string(),
        pem: z.string(),
        owner: z.object({ login: z.string() }),
      })
      .parse(await response.json());
    if (app.owner.login.toLowerCase() !== plan.organization.toLowerCase())
      throw new Error(
        "The registered App belongs to a different organization.",
      );
    material = {
      createdAt: Date.now(),
      nonce: plan.nonce,
      app,
      key: await newMailboxKey(),
    };
    materials.set(plan.nonce, material);
    if (typeof sessionStorage !== "undefined")
      sessionStorage.setItem("gitrew:setup-material", JSON.stringify(material));
  }
  const { app, key } = material;
  if (app.owner.login.toLowerCase() !== plan.organization.toLowerCase())
    throw new Error("The registered App belongs to a different organization.");
  const repository = `${plan.organization}/gitrew-auth`;
  const config: MailboxConfig = {
    version: 1,
    repository,
    clientId: app.client_id,
    appSlug: app.slug,
    appId: String(app.id),
    publicKey: key.publicKey,
    vault: `${plan.organization}/gitrew-vault`,
  };
  onStep("Saving keys in your GitHub Actions Secrets…");
  await putSecret(
    token,
    repository,
    "MAILBOX_PRIVATE_KEY",
    JSON.stringify(key.privateKey),
  );
  await putSecret(token, repository, "GITREW_APP_PRIVATE_KEY", app.pem);
  const bundleResponse = await fetch(`${baseURL}bootstrap/auth-bundle.json`, {
    credentials: "omit",
  });
  if (!bundleResponse.ok) throw new Error("Installer files are unavailable.");
  const bundle = z
    .record(z.string(), z.string())
    .parse(await bundleResponse.json());
  const allowed = [
    ".github/workflows/auth.yml",
    "scripts/action-auth.ts",
    "scripts/vault-service.ts",
    "shared/mailbox.ts",
    "shared/vault.ts",
  ];
  for (const path of allowed) {
    if (!bundle[path]) throw new Error("Installer files are incomplete.");
    onStep(`Installing ${path}…`);
    await putFile(token, repository, path, bundle[path]!);
  }
  await putFile(
    token,
    repository,
    "gitrew-auth.json",
    JSON.stringify(config, null, 2),
  );
  await putFile(
    token,
    `${plan.organization}/gitrew-chat`,
    "gitrew-workspace.json",
    JSON.stringify(
      {
        version: 1,
        organization: plan.organization,
        authRepository: repository,
        clientUrl: plan.clientUrl,
      },
      null,
      2,
    ),
  );
  onStep("Preparing the first workspace channel…");
  await createPublicChannel(
    token,
    `${plan.organization}/gitrew-chat`,
    "general",
    "The shared conversation for this workspace.",
  );
  if (plan.ownClient) await publishOwnClient(token, plan, onStep);
  materials.delete(plan.nonce);
  if (typeof sessionStorage !== "undefined")
    sessionStorage.removeItem("gitrew:setup-material");
  return config;
}
export async function publishOwnClient(
  token: string,
  plan: SetupPlan,
  onStep: (message: string) => void,
) {
  const organization = plan.organization;
  const repository = `${organization}/gitrew-client`;
  onStep("Preparing your independent client repository…");
  const existing = await fetch(`https://api.github.com/repos/${repository}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (existing.status === 404) {
    await adminApi(token, "/repos/inchidev/gitrew/generate", "POST", {
      owner: organization,
      name: "gitrew-client",
      private: false,
      include_all_branches: false,
      description: `Gitrew client installation ${plan.nonce}`,
    });
  } else {
    if (
      !existing.ok ||
      (await existing.json()).description !==
        `Gitrew client installation ${plan.nonce}`
    )
      throw new Error(
        "gitrew-client already exists. Gitrew will not replace it.",
      );
  }
  // Template generation is asynchronous: wait for the default branch before writes.
  let ready = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const branch = await fetch(
      `https://api.github.com/repos/${repository}/branches/main`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
      },
    );
    if (branch.ok) {
      ready = true;
      break;
    }
    if (branch.status !== 404 && branch.status !== 409)
      throw new Error("Could not inspect client generation.");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  if (!ready)
    throw new Error("Client repository is still being generated. Retry setup.");
  const configuredClient = await putFile(
    token,
    repository,
    "gitrew-client.json",
    JSON.stringify(
      {
        version: 1,
        authRepository: `${organization}/gitrew-auth`,
        defaultRepository: `${organization}/gitrew-chat`,
      },
      null,
      2,
    ),
  );
  const pages = await fetch(
    `https://api.github.com/repos/${repository}/pages`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    },
  );
  if (pages.status !== 404 && !pages.ok)
    throw new Error("Could not inspect GitHub Pages settings.");
  await adminApi(
    token,
    `/repos/${repository}/pages`,
    pages.ok ? "PUT" : "POST",
    { build_type: "workflow" },
  );
  onStep("Starting your GitHub Pages deployment…");
  await adminApi(
    token,
    `/repos/${repository}/actions/workflows/pages.yml/dispatches`,
    "POST",
    { ref: "main", inputs: { custom_domain: "" } },
  );
  if (typeof configuredClient.commit?.sha !== "string")
    throw new Error("Could not identify the client deployment revision.");
  onStep("Waiting for your GitHub Pages deployment…");
  await waitForPagesDeployment(token, repository, configuredClient.commit.sha);
}

export async function waitForPagesDeployment(
  token: string,
  repository: string,
  head: string,
) {
  for (let attempt = 0; attempt < 90; attempt++) {
    const result = await adminApi(
      token,
      `/repos/${repository}/actions/workflows/pages.yml/runs?event=workflow_dispatch&per_page=20`,
    );
    const run = result.workflow_runs?.find(
      (value: { head_sha: string }) => value.head_sha === head,
    );
    if (run?.status === "completed") {
      if (run.conclusion !== "success")
        throw new Error(
          "Your Pages deployment failed. Open the client repository’s Actions tab, fix the reported problem and retry setup.",
        );
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    "Pages is still building. Keep the setup tab open and retry setup in a few minutes.",
  );
}

export async function createPublicChannel(
  token: string,
  repository: string,
  title: string,
  body: string,
) {
  const [owner, name] = repository.split("/");
  const graph = async (query: string, variables: unknown) => {
    const result = await adminApi(token, "/graphql", "POST", {
      query,
      variables,
    });
    if (result.errors?.length)
      throw new Error(
        "GitHub could not create this channel. Check Discussions permissions.",
      );
    return result.data;
  };
  const result = await graph(
    "query Setup($owner:String!,$name:String!) { repository(owner:$owner,name:$name) { id discussionCategories(first:20) { nodes { id slug } } discussions(first:100) { nodes { title } } } }",
    { owner, name },
  );
  if (
    result.repository.discussions.nodes.some(
      (d: { title: string }) => d.title === title,
    )
  )
    return;
  const categories = result.repository.discussionCategories.nodes as {
    id: string;
    slug: string;
  }[];
  const category =
    categories.find((c) => c.slug === "general") || categories[0];
  if (!category)
    throw new Error("Create a General Discussions category on GitHub first.");
  await graph(
    "mutation Setup($repositoryId:ID!,$categoryId:ID!,$title:String!,$body:String!) { createDiscussion(input:{repositoryId:$repositoryId,categoryId:$categoryId,title:$title,body:$body}) { discussion { id } } }",
    {
      repositoryId: result.repository.id,
      categoryId: category.id,
      title,
      body,
    },
  );
}
