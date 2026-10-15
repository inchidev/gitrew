# Gitrew landing review — 2026-10-15

Two rounds with one independent design critic. Existing Primer branding was intentionally retained.

| Criterion            | Round 1 | Round 2 |
| -------------------- | ------: | ------: |
| Concept              |       4 |       4 |
| Category distinction |       3 |       3 |
| Avoids slop          |       4 |       4 |
| First screen         |       3 |       4 |
| Typography           |       4 |       4 |
| Colour               |       4 |       4 |
| Richness             |       3 |       4 |
| Structure and rhythm |       4 |       4 |
| Craft                |       2 |       4 |
| Responsive           |       2 |       4 |
| Everyone's computer  |       3 |       3 |
| Signature            |       3 |       4 |
| Screenshot test      |       3 |       3 |
| Fidelity             |       4 |       4 |

Round 1 found provider status overflow on phones. Round 2 verified the corrected three-cell row, concrete illustrative celld conversation, quieter workflow labels and provider-switch filmstrip including reduced motion. Ten of thirteen design lines reached4; none below3. System UI typography is deliberate continuity with the app.

Fixed after the last round, not rescored: explicit whitespace between the provider/research sentences; thread explanatory text raised to14px. Reran the complete matrix on this final page: Windows125/150%, high contrast, Linux font metrics, Android, Firefox, WebKit desktop/iPhone emulation,320px reflow, reduced motion and two localization expansions all passed. The previous matrix was stale and is not the final evidence. No physical-device claims are made.

Evidence: ignored artifacts/design/round2, gitea-film, final-matrix. Scan warnings concern intentional system fonts, metadata below15px and the research list heuristic; no mechanical FAIL remains.

## Chat-first evolution — 2026-10-15

User-directed changes preserve the existing visual direction: larger brand, no intro eyebrow, a shared provider/research selector, Watching badges, no separate watchlist, Cloudflare/VPS deployment options and chat-first copy. The illustrative preview stays until a later real screenshot task.

Continued independent critic reviewed r1 at390/711/1440: requirements met, no overflow or clipping; identified missing whitespace after `first:` and suggested `Explore platforms`. Both fixed in r2. Light/dark mechanical scans passed. Twelve platform/emulation passes in `artifacts/design/chat-focus-r2/matrix` passed without failures/warnings. Existing system-font and14px supporting-copy scan warnings remain deliberate to preserve the established product direction. Actual physical-device audio/push tests are separate from this landing check.
