# Gitrew UI

The app keeps Slack's workspace/channel/thread structure and GitHub's visual
language. The three static studies are `a.html`, `b.html` and `c.html`; B's
workspace rail won. They are design studies, not deployable product screens.

Use `app/assets/css/main.css` for layout and Primer semantic token mappings.
Use `app/app.config.ts` for Nuxt UI defaults and Octicons. Add controls through
Nuxt UI with accessible names; use Primer roles rather than literal colours.
`app/app.vue` selects the light/dark token theme. The system font is intentional.

`AuthContent.vue` is shared by the standalone signed-out entry and the explicit
demo's sign-in dialog. Keep the chat shell unmounted until authentication or an
explicit demo choice. Product copy describes user actions; deployment keys,
repository paths and infrastructure belong in administration flows.

`BrandMark.vue` masks the generated PNG with the current text colour. Asset and
generation provenance are described in `logo.md`.

Design constraints: `DIRECTION.md`. Independent critique and local validation:
`CRITIQUE.md`. Evidence screenshots are ignored under `artifacts/redesign/`;
fixture/demo captures are not live authorization or real-device proof.
