import process from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

const portal = process.env.NUXT_PUBLIC_SITE_MODE === "portal";

// Public configuration for independent template copies. No credentials belong here.
const clientConfig = existsSync("gitrew-client.json")
  ? z
      .object({
        version: z.literal(1),
        authRepository: z.string().regex(/^[\w-]+\/gitrew-auth$/),
        defaultRepository: z.string().regex(/^[\w-]+\/[\w.-]+$/),
      })
      .parse(JSON.parse(readFileSync("gitrew-client.json", "utf8")))
  : null;

export default defineNuxtConfig({
  compatibilityDate: "2026-10-14",
  ssr: false,
  buildDir:
    process.env.NUXT_BUILD_DIR ||
    (process.env.npm_lifecycle_event === "build" ? ".nuxt-build" : ".nuxt"),
  devtools: { enabled: false },
  vue: {
    compilerOptions: { isCustomElement: (tag) => tag.startsWith("rtk-") },
  },
  modules: ["@nuxt/ui", "@vueuse/nuxt"],
  ui: { experimental: { componentDetection: true } },
  css: ["~/assets/css/main.css"],
  fonts: {
    providers: {
      google: false,
      googleicons: false,
      bunny: false,
      fontshare: false,
    },
  },
  colorMode: { preference: "system", fallback: "light" },
  icon: { clientBundle: { scan: true }, provider: "none" },
  app: {
    baseURL: process.env.BASE_PATH || "/",
    head: {
      title: "Gitrew — your Git crew",
      htmlAttrs: { lang: "en" },
      viewport: "width=device-width, initial-scale=1, viewport-fit=cover",
      meta: [
        {
          name: "description",
          content:
            "A place for the people behind the code. Open-source team chat. GitHub first; Gitea and GitLab later.",
        },
        { name: "referrer", content: "no-referrer" },
        ...(portal
          ? []
          : [
              { name: "apple-mobile-web-app-capable", content: "yes" },
              {
                name: "apple-mobile-web-app-status-bar-style",
                content: "default",
              },
            ]),
      ],
      link: [
        ...(!portal
          ? [
              {
                rel: "manifest" as const,
                href: `${process.env.BASE_PATH || "/"}manifest.webmanifest`,
              },
            ]
          : []),
        {
          rel: "apple-touch-icon",
          href: `${process.env.BASE_PATH || "/"}icons/apple-touch-icon.png`,
        },
        {
          rel: "icon",
          type: "image/svg+xml",
          href: `${process.env.BASE_PATH || "/"}favicon.svg`,
        },
      ],
    },
  },
  runtimeConfig: {
    public: {
      siteMode: portal ? "portal" : "workspace",
      backendEnabled: process.env.NUXT_PUBLIC_BACKEND_ENABLED === "true",
      oauthBrokerUrl: "",
      defaultRepository: clientConfig?.defaultRepository || "",
      authRepository: clientConfig?.authRepository || "",
    },
  },
  hooks: {
    "pages:extend"(pages) {
      if (portal) {
        const publicPages = pages.filter((page) => page.path === "/");
        pages.splice(0, pages.length, ...publicPages);
      }
    },
  },
  nitro: {
    prerender: {
      routes: portal ? ["/"] : ["/create/", "/login"],
      ...(portal ? { crawlLinks: false } : {}),
    },
  },
  typescript: { strict: true },
});
