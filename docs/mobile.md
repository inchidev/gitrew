# Mobile web and installed PWA

Basic installation and launch on an iPhone were confirmed by the owner on 2026-10-15. This confirms the basic PWA flow; it does not complete all physical-device checks in issue #2.

## Desktop Chrome installation

Chrome's address-bar **Open in app** button belongs to the browser and appears for an application already installed in that desktop Chrome profile. An iPhone installation or a Safari Dock app does not install it in Chrome on the Mac. Before installation, Chrome may show an install action according to its installability and engagement checks.

Gitrew supplies 192×192 and 512×512 PNG manifest icons, a padded maskable icon and a separate 180×180 Apple touch icon, derived from the existing mark. A live Chrome diagnostic previously returned `manifest-missing-suitable-icon` when the manifest offered only a 1254×1254 image; the canonical icons resolve that failure. Its app ID, scope and start URL stay unchanged. Installation does not request notification permission. The push service worker remains network-only, with no offline page, message or API caching.

See [Chrome install criteria](https://web.dev/articles/install-criteria). After installing Gitrew in Chrome, revisit a Gitrew URL in the same profile to use the browser's **Open in app** action.

## Safe areas and navigation

The viewport uses `viewport-fit=cover`. Toolbars, navigation, threads, the composer, sign-in and setup pages reserve the device's safe-area insets. The page background and `theme-color` follow the selected light/dark theme: workspace chrome uses the sidebar/toolbar surface, while sign-in and other pages use the page surface. The manifest provides a neutral light launch fallback; after the app loads, the page metadata follows the active theme. Browser and OS chrome rendering still needs checking on each supported device.

On narrow screens, swipe right from the left gutter (20–88 CSS pixels from the left edge) to open channels. Swipe left across the sidebar or backdrop to close it. The outermost edge remains available for browser/OS navigation. Vertical scrolling, multi-touch, text selection, input editing, open threads and dialogs do not trigger channel navigation. The menu buttons remain available.

## GitHub sign-in on iOS and Android

Use **Continue with GitHub** inside the browser or installed Gitrew. It starts the standard GitHub web OAuth flow with state and PKCE, then returns to the installation's HTTPS callback and requested conversation. Sign into GitHub in that browser when asked; an existing session in the GitHub Mobile app is not a session Gitrew can reuse directly.

GitHub documents web authorization and device authorization flows. We found no documented GitHub Mobile OAuth broker/deep-link contract that Gitrew can use to force authorization inside the native GitHub app. Gitrew therefore does not rewrite the authorization URL to `github://` or an Android intent. Whether an HTTPS link opens another app is controlled by the OS, installed apps and their link associations; Gitrew cannot promise that handoff or a return into its installed PWA.

Keep the OAuth flow in the originating browser/PWA context. If the OS opens a separate browser, confirm the result after returning to Gitrew; do not assume browsers and installed apps share cookies. A future native Gitrew wrapper would need its own system-browser authorization and verified app/universal-link return, with one-use session transfer and separate security tests. Device flow is another possible explicit feature, but requires enabling it on each GitHub App and is not implemented by the current backend.

## Device checks still needed

- iPhone Home Screen and Android installed app: portrait/landscape, top/bottom colors in both themes, keyboard open/closed and composer placement.
- Swipe opening/closing without taking over feed scrolling, selection, editing, OS back or pinch zoom.
- Fresh OAuth, return to a specific channel/DM, relaunch, logout and a switch between Safari/Chrome and the installed app.
- Actual microphone/audio and background Web Push; installation alone does not establish those capabilities.

References: [WebKit safe-area layout](https://webkit.org/blog/7929/designing-websites-for-iphone-x/), [Safari theme-color](https://webkit.org/blog/11989/new-webkit-features-in-safari-15/), [GitHub App web and device authorization](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app).
