# 07 · Premium feel: motion, type, density, micro-interactions

Question: what concretely makes an interface read as crafted and calm rather than a generic or AI-template look. The answer is a do/don't list.

Researched 2026-10-31. These rules build on the blueprint's tokens:
- Fonts: Schibsted Grotesk for UI, Source Serif 4 for reading.
- Tokens: `--k-r`, `--k-gap`, `--k-pad`, `--k-row` (40/32 px), `--k-fs` (14/13 px).
- Colour: a cobalt accent on a neutral bench.

## TL;DR

Premium comes from **restraint plus consistency plus speed**, not ornament. Specifically:
- Motion is short (100 to 300 ms) and only where it explains something.
- One accent colour and one type family for UI.
- Tabular numbers, aligned edges, and real keyboard support with visible shortcuts.
- Honest, specific copy.

The AI-template look comes from defaults that nobody decided on: purple gradients, glassmorphism, emoji headings, big rounded cards everywhere, bouncy springs and sparkle icons.

## Findings

- **Motion duration (NN/g):** 100 to 500 ms overall. Simple feedback about 100 ms. Large screen changes 200 to 300 ms. 400 ms is slow, and at 500 ms motion "starts to feel like a drag". Entering elements take slightly longer than exiting ones (300 vs 200 to 250 ms). "It is far more common for animations to be too long than too short." "The more frequent the animation, the more subtle and shorter." Ease-out for entering. Respect reduce-motion. [Animation duration](https://www.nngroup.com/articles/animation-duration/)
- **Apple HIG:** "Add motion purposefully ... Don't add motion for the sake of adding motion. Gratuitous or excessive animation can distract people and may make them feel disconnected or physically uncomfortable." "Make motion optional", and never use it as the only carrier of information. [HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion)
- **Material 3 motion tokens** (from secondary token listings; the official page did not render): `short1` = 50 ms, `medium2` = 300 ms. Emphasized easing is `cubic-bezier(0.2, 0, 0, 1)`, emphasized-decelerate `(0.05, 0.7, 0.1, 1)`, emphasized-accelerate `(0.3, 0, 0.8, 0.15)`. [m3 tokens page](https://m3.material.io/styles/motion/easing-and-duration/tokens-specs), as cross-checked in [docs.rs port](https://docs.rs/crate/hydrolysis-m3/latest/source/src/theme/motion/tokens.rs)
- **Linear redesign:**
  - Themes are built in LCH from **three variables (base, accent, contrast)** instead of 98, which also gives a high-contrast theme for free.
  - Inter Display for headings.
  - Visual noise reduced in the sidebar, tabs and headers.
  - Labels, icons and buttons aligned "vertically and horizontally", which is "subtle but noticeable after a few minutes of use".
  - Brand blue kept out of neutral surfaces.
  [How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui)
- **Linear craft:** a submenu "safe triangle" so diagonal mouse paths don't close menus. Context menus show shortcuts. [Invisible details](https://linear.app/now/invisible-details)
- **Raycast:** every action lists its shortcut, and the action panel is searchable. Its own stated principles are "fast, simple, and delightful". [Action Panel](https://manual.raycast.com/action-panel.md), [A fresh look and feel (summary)](https://www.plushcap.com/content/raycast/blog/raycast-a-fresh-look-and-feel)
- **Atlassian:** a 700 ms single flash on a moved item, and a 2 px drop line. This is motion that *explains a change*. [Pragmatic DnD guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines)
- **NN/g copy:** labels of 2 to 4 words starting with a verb. Avoid "playful" or branded wording and "OK" buttons. [UI copy](https://www.nngroup.com/articles/ui-copy/)

## The motion budget for DailyKit

| Use | Duration | Easing |
|---|---|---|
| Hover, press, switch thumb, checkbox | 80 to 120 ms | ease-out |
| Tab change underline, segmented control | 150 ms | `cubic-bezier(0.2,0,0,1)` |
| Popover, menu, palette open | 160 ms in / 120 ms out, opacity + 4 px translate or 0.98 → 1 scale | in: decelerate, out: accelerate |
| Panel content switch (rail) | 0 ms, an instant swap. Optional 120 ms opacity fade | — |
| Toast enter / exit | 200 / 150 ms | decelerate / accelerate |
| "Changed" highlight (moved row, jumped-to setting) | 700 ms single flash | ease-out |
| Progress bars (context meter, usage) | 300 ms width tween, only when the value changes | standard |

Hard rules:
- Nothing loops except a real spinner (2 to 10 s operations).
- No springs or overshoot.
- Never animate layout height on lists over 20 rows.
- `prefers-reduced-motion: reduce` sets every duration to 0 except opacity fades of 100 ms or less.

## Do

1. **One UI typeface (Schibsted Grotesk), with exactly 3 weights: 400, 500 and 650.** Use Source Serif 4 only for reading saved chats, which is the blueprint's split. Use a monospace face only for code and `<kbd>`.
2. **Type scale of 5 sizes in the panel:** 12 / 13 / 14 / 16 / 20 px (compact density shifts it by −1). Use `font-variant-numeric: tabular-nums` on every number: tokens, percentages, times, counts.
3. **Sentence case everywhere.** Write specific copy with numbers ("124k of 200k tokens", "Resets in 2h 10m"), no exclamation marks, and no "Oops!".
4. **One accent colour**, used for at most a primary button, the focus ring, the selected-tab underline and progress. Neutrals carry everything else. Generate themes from **base + accent + contrast** (Linear) in OKLCH, so light, dark and high-contrast all come from one generator. The blueprint's ~12 tokens fit this.
5. **A 4 px spacing grid.** Rows are 40 px comfortable / 32 px compact. Icons are 16 px on a 20 px box, optically centred. Align left edges of icons, labels and inputs to the same x. That is the "noticeable after a few minutes" detail.
6. **Hairline borders (1 px, a low-contrast line token) instead of shadows.** Shadows only on floating layers (menus, palette, toast), and then one soft shadow.
7. **Corners from the theme token only.** Nested radius = outer radius − padding, as in the blueprint's `calc(var(--k-r) - 2px)`.
8. **Visible keyboard craft:**
   - A focus ring on `:focus-visible` (2 px accent, 2 px offset).
   - `<kbd>` chips next to actions.
   - `?` opens the shortcut list.
   - Arrow-key navigation in every list, and Enter or Esc behave predictably.
9. **Instant first paint** from local data. Optimistic updates with no spinner for local actions.
10. **Micro-interactions that carry information:**
    - Copy buttons change to "Copied" for 1.2 s.
    - The context meter changes colour at 75% / 90% (Cairn's thresholds).
    - The moved row flashes once.
    - A switch moves its thumb in 100 ms.
11. **Respect the host and the OS:** follow `prefers-color-scheme` by default, set `color-scheme` so native scrollbars and inputs match, and support `forced-colors`.
12. **Truncation with intent:** one-line ellipsis for titles, with the full text in a `title` attribute or tooltip. Never wrap a list row to three lines.

## Don't (the "AI-template" tells)

1. Purple-to-blue gradients, mesh blobs, glassmorphism or frosted panels, glow shadows.
2. Sparkle ✨ or magic-wand icons for anything, emoji in headings or buttons, gradient text.
3. Big rounded "feature cards" with an icon in a coloured circle, a bold title and two lines of grey text, repeated in a 3-column grid. That pattern is how DailyKit's own pages would look like a landing-page template.
4. Centred hero text inside a 360 px panel. Panels are left-aligned and start with content.
5. Bouncy springs, staggered list entrances, skeleton shimmer on local data, confetti.
6. More than one accent colour, or status colours used decoratively (green buttons that aren't "success").
7. Vague copy ("Unlock your productivity", "Supercharge", "Seamlessly"), "OK" buttons, and title-case sentences.
8. Tooltips that only repeat the label. A tooltip adds the shortcut or the consequence, or doesn't exist.
9. Default browser focus outlines removed with nothing put in their place.
10. Inconsistent icon sets. Use one icon family with one stroke width (1.5 px at 16 px).
11. Modals for anything that could be inline. In a 360 px panel, a modal is nearly the whole screen.
12. Placeholder-as-label inputs.

## Review checklist (before merging any screen)

- [ ] Screenshot at 360 px and 600 px, light and dark, comfortable and compact.
- [ ] Every number is tabular. Every row edge aligns.
- [ ] The whole screen can be operated without a mouse. Shortcuts are shown.
- [ ] No animation over 300 ms except the 700 ms change highlight. Reduce-motion is honoured.
- [ ] Only theme tokens are used. No hard-coded colour, radius or gap. The lint rule already planned in the blueprint enforces this.
- [ ] Copy: verb-first labels, no "OK", no exclamation marks.
