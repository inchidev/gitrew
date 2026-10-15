export default defineAppConfig({
  ui: {
    colors: { primary: "green", neutral: "gray" },
    icons: {
      check: "i-octicon-check-16",
      chevronDown: "i-octicon-chevron-down-16",
      chevronLeft: "i-octicon-chevron-left-16",
      chevronRight: "i-octicon-chevron-right-16",
      chevronUp: "i-octicon-chevron-up-16",
      close: "i-octicon-x-16",
      loading: "i-octicon-sync-16",
      search: "i-octicon-search-16",
      external: "i-octicon-link-external-16",
    },
    button: { slots: { base: "cursor-pointer" } },
  },
});
