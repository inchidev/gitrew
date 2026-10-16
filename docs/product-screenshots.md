# Landing product screenshots

The landing shows the actual Gitrew client with sample API responses. Robin and
Sam's messages are synthetic; no production session, private conversation or
credentials are used. The workspace/repository label is our public source
organization. Light/dark desktop and phone WebP assets live in `public/images/`.

To refresh them after a UI change, use Node 24 and the repository's installed
dependencies (including Nuxt's Sharp dependency):

1. `npm run build` for the standard client build.
2. In another terminal, `node tests/serve-static.mjs`.
3. `node scripts/capture-product.mjs` (optionally pass a local origin).
4. Inspect the PNG captures under `output/product-screenshots/` and
   commit the optimized WebP files. The script accepts only a loopback origin.
5. Run `npm run test:e2e:portal` to check desktop/mobile and both themes.

The screenshot is product evidence with sample content, not a live conversation
feed. It does not establish multi-person audio, background notification delivery
or physical-device acceptance; those remain tracked in the roadmap.
