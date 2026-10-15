import { appReturnTo, legacyWorkspacePath } from "../../shared/routes";

export default defineNuxtRouteMiddleware((to) => {
  if (to.path !== "/") return;
  const query = to.query;
  if (query.preview === "1") return navigateTo("/login", { replace: true });
  // Existing broker callbacks still return to the registered root URL.
  if (query.code || query.error || query.authError || query.setup)
    return navigateTo({ path: "/login", query }, { replace: true });
  if (typeof query.workspace === "string") {
    const target = legacyWorkspacePath(
      query.workspace,
      typeof query.channel === "string" ? query.channel : "",
    );
    if (target) {
      const url = new URL(target, "https://gitrew.invalid");
      if (typeof query.auth === "string")
        url.searchParams.set("auth", query.auth);
      return navigateTo(appReturnTo(url.pathname + url.search)!, {
        replace: true,
      });
    }
  }
  if (query.channel || query.auth)
    return navigateTo({ path: "/login", query }, { replace: true });
});
