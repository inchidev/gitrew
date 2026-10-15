export { LiveHub } from "./live-hub";
import worker, { type BackendEnv } from "./worker";

// celld 0.6.2 does not apply its SPA fallback to trailing-slash routes.
// Keep API paths intact; normalize only static client requests.
export default {
  fetch(request: Request, env: BackendEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (
      ["GET", "HEAD"].includes(request.method) &&
      !url.pathname.startsWith("/api/") &&
      url.pathname !== "/" &&
      url.pathname.endsWith("/")
    ) {
      url.pathname = url.pathname.replace(/\/+$/, "");
      request = new Request(url, request);
    }
    return worker.fetch(request, { ...env, PLATFORM: "celld" }, ctx);
  },
};
