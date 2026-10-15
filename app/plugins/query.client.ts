import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { GitHubError } from "~/lib/github";

export default defineNuxtPlugin((nuxtApp) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 30 * 60_000,
        refetchOnWindowFocus: true,
        retry: (attempt, error) =>
          attempt < 2 && !(error instanceof GitHubError),
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 30_000),
      },
      mutations: { retry: false, networkMode: "always" },
    },
  });
  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient });
});
