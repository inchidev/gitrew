# Design review

Independent critique by one continuing design critic, following the
web-designer rubric. This reviews the local client foundation, not production
authentication or live GitHub integration.

| Criterion                | Round 1 | Round 2 |
| ------------------------ | ------: | ------: |
| Concept on the page      |       3 |       3 |
| Not the category average |       3 |       3 |
| Not a slop face          |       4 |       4 |
| First screen             |       3 |       4 |
| Typography               |       4 |       4 |
| Colour                   |       4 |       4 |
| Richness                 |       3 |       4 |
| Structure and rhythm     |       4 |       4 |
| Craft                    |       4 |       4 |
| Responsive               |       4 |       4 |
| Everyone's computer      |       4 |       4 |
| Signature                |       2 |       3 |
| Screenshot test          |       3 |       3 |

Round 1: seven of thirteen criteria at 4+, signature below 3. The working
conversation was coherent but the tutorial content and repeated local-storage
labels made it read like scaffolding. The signature filmstrip showed only a
generic entrance.

Round 2: nine of thirteen criteria at 4+, none below 3. Specific sample team
content, a matching parent/thread rail, a phone return action and an immediate
preview action improved the core experience. All five round-1 asks were
substantially addressed. The layout remains a familiar chat, deliberately so
for this experiment. It has not met the numerical studio-quality stop rule
of ten criteria at 4+; no claim of that standard is made.

## Final cleanup after round 2 (not rescored)

- Put the unfinished-login notice before the fields.
- Updated the entry's sample exchange to match the actual preview.
- Removed the duplicate lower preview link.
- Limited message paragraphs to 66ch.
- Added a browser assertion that opening, replying to and closing a thread
  preserves the room draft.

## Verification

The final round-2 scan at 390, 768, 1280 and 1440 CSS pixels has no failures.
The 12-pass platform matrix is clean: Windows 125/150%, forced colours,
Linux, Android, Firefox, WebKit desktop/iPhone, 320px reflow, reduced motion,
and desktop/phone localization stress. Earlier forced-colour and label-wrap
failures were fixed. A hidden status element's mobile width caused horizontal
overflow during round 2; it was constrained and the full matrix rerun.

Local artifacts (ignored by Git):

- `artifacts/design/r2-fixed/sheet.png`
- `artifacts/design/r2-fixed/matrix/sheet.png`
- `artifacts/design/r2/film/strip.png`
- `artifacts/design/final-entry/sheet.png`
- `artifacts/design/final-light/sheet.png`

The filmstrip shows thread opening but does not prove the complete
draft/open/return interaction; that behavior is covered by the browser test.
WebKit and platform emulation are not tests on physical devices. Screen
readers, actual Windows glyph rasterization and production performance have
not been measured.

## Nuxt migration — round 1

The existing critic continued after the migration to Nuxt UI. Scores by rubric
line: **3, 3, 4, 4, 3, 4, 4, 4, 4, 4, 2, 3, 3**. Seven of thirteen at 4+.
The welcome modal clarified GitHub identity. Defects: CSS-mask icons disappeared
in High Contrast, desktop prose was wide, seed-message storage labels repeated
permanent preview notices, phone utility chrome competed with messages, and the
thread capture did not demonstrate the source/parent relationship.

## Nuxt migration — round 2

Scores: **3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 3**. Nine of thirteen at 4+;
none below 3. The critic found no remaining material visual defect and advised
against restarting the design to chase distinctiveness. This does **not** meet
the numerical studio rule of ten lines at 4+; scores are reported as given.

All five fixes landed: High Contrast icons use CanvasText with forced-colour
adjustment disabled for their masks; prose is constrained to 56ch (the actual
font makes 66ch about 625px); sample per-message labels are screen-reader-only;
one preview explanation replaces multiple notices and export moves to a menu;
matching copper rails identify the source and quoted parent.

The interaction capture exposed a transient close-thread defect: the grid
changed to two columns while the leaving third child was still present. The
client now retains the third column until `after-leave`. Settled screenshots
and a browser check confirm full sidebar height, a restored composer, and the
same room draft after return. Thread drafts remain separate.

Latest artifacts, local and ignored:

- `artifacts/design/nuxt-auth-r1-fixed/sheet.png`: welcome modal at 390/1440.
- `artifacts/design/nuxt-auth-r1-fixed/matrix/`: twelve clean platform passes.
- `artifacts/design/nuxt-chat-r2/sheet.png`: chat at 390/768/1280/1440.
- `artifacts/design/nuxt-chat-r2-final/matrix/`: twelve clean platform passes.
- `artifacts/design/nuxt-chat-r2/film/strip.png`: whole-shell thread frames.
- `artifacts/design/nuxt-chat-r2/interaction/`: before, settled thread and return.

The 11px metadata warnings are deliberate for timestamps, draft/sync notices
and secondary utilities; message text is 13/14px. No text is below 11px.
Browser engines and emulated platform settings are not real-device, ClearType,
screen-reader or production-performance proof. The filmstrip begins at the
opening interaction; the separate before image supplies its pre-trigger state.
The final optional polish shortens the phone search placeholder; not rescored.

## GitHub / Slack redesign — round 1 (2026-10-14)

One continuing independent critic reviewed light chat at 390/768/1280/1440,
phone and desktop sign-in, dark chat, and the old screenshots. The explicit
brief prioritizes GitHub fidelity over the skill's originality heuristics.

| Criterion | Round 1 | Round 2 |
| --- | ---: | ---: |
| Concept on the page | 5 | 5 |
| Not category average, within the brief | 4 | 4 |
| Not a slop face | 4 | 4 |
| First screen | 4 | 4 |
| Typography | 4 | 4 |
| Colour | 4 | 4 |
| Richness | 4 | 4 |
| Structure and rhythm | 3 | 4 |
| Craft | 4 | 4 |
| Responsive | 4 | 4 |
| Everyone's computer | 3, provisional | 4 |
| Signature | 3, provisional | 4 |
| Screenshot test | 4 | 4 |
| Fidelity to kept functionality | 3, provisional | 4 |

Ten of thirteen visual criteria at 4+, with interaction/matrix proof still
pending. Round 1 is not done by the stop rule.

Five asks: replace repeated zero-reply text with an accessible icon affordance;
remove the empty action row to compact transcript rhythm; remove “Bringing your
team?”; bound message text to 85–95ch; supply thread, drawer, search and private
conversation evidence. All accepted. Real reply counts stay visible; keyboard
and touch thread creation stay available. The large empty area after a short
conversation is deliberate and should not be filled with marketing.

Exploration exceptions: all studies keep GitHub typography and Primer colours
because those are the user's explicit requirements. No illustrative animation,
stock people or decorative UI is added to satisfy a generic originality score.

## GitHub / Slack redesign — round 2

All five round-1 asks landed. The continuing critic scored Concept 5, all other
13-line rubric criteria 4, and Fidelity 4. The stop rule is met. The filmstrip
shows the selected source message and its matching thread; the phone drawer,
full-screen thread, draft return, search and private-channel fixture were also
reviewed. No new direction or additional round is requested.

Final local evidence: `r2-final-chat/` has clean scans at 390/768/1280/1440 and
19 visible, uncovered keyboard stops; `r2-final-dark/` is clean at 390/1440;
`r2-auth/` is clean with six keyboard stops. Paths are under the ignored
`artifacts/redesign/` directory. `r2-matrix-auth/` has twelve clean passes.
`r2-matrix-chat/` plus `only-l10n+reflow/` cover twelve clean platform cases.
The original 320px clipped topic was fixed; localization fixes shorten the
sidebar host action and ellipsize topics. Rail tooltips open beside the rail
so they cannot cover the next focused control.

Expected signed-out HTTP401 responses appear in renderer diagnostics. They are
not layout defects or authorization failures. The local visual server supplies
configuration and a signed-out response, not a real authenticated backend.
The private fixture capture checks UI only. Full tests separately verify
private-channel access/logout isolation; no new second-account live claim or
DM-specific screenshot is made.

Fixed after the last round, not rescored: suppress the browser's duplicate
search cancel glyph; use one Primer-blue input focus ring; show matching
lock/person icons in private/DM headers. Targeted captures/scans verify them.

All kept interactions remain covered by the existing regression suites. The
six slop checks were applied within the explicit fidelity brief: the rail and
conversation remain legible without branding; copy names actions; visual
content is the product; the screen avoids template marketing and fake metrics;
mobile preserves the working surface; restrained thread motion adds context.
The familiar GitHub/Slack silhouette is intentional, not an originality claim.

Physical devices, screen readers, real Windows glyph rendering and production
performance have not been measured. The result uses system fonts deliberately.

## 2026-10-15 landing, round 1

Independent continued critic reviewed 390/768/1440 and full pages. Concept,
GitHub/Slack fidelity, non-slop, first screen, type, colour, richness, structure,
responsive and screenshot scored 4; craft, platform coverage and signature were
provisional 3. Requested readable 12px phone preview rail text, working reply/
composer actions, dark and platform evidence, and a switching-channel filmstrip.

## 2026-10-15 landing, round 2

All requests landed: 12px meaningful phone rail labels with a 112px rail; blue
reply count links to the actual demo thread; composer enters demo; channel buttons
switch selection and messages. Independent critic scored every one of the 13
rubric lines plus Fidelity 4, with no further visual changes requested. Done by
the stop rule. Existing logo, Primer palette, system typography, chat features
and light/dark themes retained.

Evidence: `artifacts/routes/landing-r2/`, `landing-r2-dark/`,
`landing-interaction/strip.png`, and `landing-matrix/matrix.md`. Both light/dark
scans have no FAILs and keyboard focus walks have 13 stops. The 12-pass matrix
(Windows scaling/contrast, Linux, Android, Firefox, WebKit desktop/iPhone, 320px,
reduced motion and translation stress) has no FAILs. System-font and compact
12–14px copy warnings are deliberate GitHub-language choices; no font replacement
or oversized demo copy. These are local renders and emulations, not real-device
or production proof. Content still requires JavaScript in the existing SPA build.
