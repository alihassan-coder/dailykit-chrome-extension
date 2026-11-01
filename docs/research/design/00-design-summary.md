# Toolbelt design summary: logo and side panel

This is the checklist for the builder. Sources and reasoning are in:
- `01-extension-logo.md` (L)
- `02-premium-side-panel.md` (P)

Researched 2026-11-01 against:
- Chrome developer docs and Chromium source
- CWS image rules
- Material 3 (androidx source)
- Microsoft Learn icon guidelines and Apple HIG
- WCAG 2.2 and WAI-ARIA APG
- NN/g
- Linear, Raycast, Superhuman and Mailchimp

Items marked **(unverified)** in the source files are not repeated as facts here.

## Decisions for the user (before building)

1. **Logo direction:** 1 Holster (recommended), 2 Prong or 3 Loop. Specs are below.
2. **Accent colour:** the icon plate uses **#4467F5**, chosen for ≥3:1 contrast on light and dark toolbars. Pick one:
   - align the panel's UI accent to it, or
   - keep the current UI cobalt and treat the plate as brand-only.
3. **Frame font:** `system-ui` (most Chrome-native) or Schibsted Grotesk (brand) for search, rail and headings.
4. **Name check:** "Toolbelt" is already used by other products ("Dev Toolbelt", a CWS "Toolbelt" utility (unverified), and the ToolBelt construction app). Run a CWS and trademark search before final art.

## Logo checklist (L)

1. Ship PNG icons at 16, 24, 32, 48 and 128. SVG and WebP are not supported.
   - 128 = **96×96 artwork + 16 px transparent padding**, with alpha.
   - 48 = 40 px plate.
   - 16, 24 and 32 are **full-bleed plates, hand-fitted to whole pixels**, not downscaled.
2. Wire the same set to `icons` and `action.default_icon`. Set `action.default_title` = "Toolbelt".
3. One icon must serve both toolbar themes, because Chromium has no `theme_icons`. Use a **solid plate** (#4467F5, radius 25% of plate) with a white mark.
4. No text or letters. No rings or ovals as the main shape (they read as 0/8/D at 16 px). No upright equal bars (they read as a chart). No puzzle, sparkle, gear, wrench, toolbox, Swiss cross or four-square grid. No Chrome blue (#0B57D0).
5. No edge or border, no large shadow, no perspective, and no gradient steeper than one step.
6. At 16 px every stroke is ≥2 px and every gap ≥1 px. Overlaps are separated by plate-colour knockout gaps: 4 px at 128, 2 px at 48, 1–2 px at 32, 1 px at 16.
7. Spend the amber accent (**#FFC53D**) on exactly **one** element, "the tool in use". It never touches the plate edge.
8. Monochrome variant:
   - no plate, `currentColor`
   - knockouts kept
   - the accent element becomes the heaviest solid shape
   - white elements drop to about 2/3 weight
9. Review every candidate in the real toolbar next to 1Password, uBlock and Grammarly. Check light and dark Chrome themes, 100% and 150% zoom, plus a squint test.
10. Module icons for standalone sales reuse the Loop construction with a module-specific tool head at ≥48 px. This is a proposal.

### Recommended directions (128 canvas, plate 96×96 at (16,16), r 24)

**1 · Holster (lead): three tools tucked into a strap, leaning, middle one amber.**
- **Tools:** capsules 14 wide. Before leaning:
  - left x30–44 y40–100
  - middle x54–68 y26–100 (amber)
  - right x78–92 y46–100
- **Lean:** shear the group 18° with tops to the right (`translate(24 0) skewX(-18)`).
- **Knockout band:** plate colour, y66–92, full width.
- **Strap:** white, y70–88 (18 tall), edge to edge of the plate. Tool ends show below the strap.
- **Strokes:**

| Size | Tool | Strap | Gap |
|---|---|---|---|
| 128 | 14 | 18 | 4 |
| 48 | 5 | 7 | 2 |
| 32 | 4 | 6 | 2 |
| 16 | 2 | 2 | 1 |

- **16 px:** two tools only (`.` = plate, `W` = white, `A` = amber):
```
................
................
..........AA....
.........AAA....
.........AA.....
....WW..AAA.....
....WW..AA......
...WW..AAA......
...WW..AA.......
................
WWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWW
................
..WW..AA........
................
................
```

**2 · Prong: buckle, strap through it, amber prong.**
- **Strap:** white, x16–112, y54–74.
- **Clearance:** plate-colour rounded rect x36–92, y30–98, r16.
- **Frame ring:** outer x40–88, y34–94, r14. Inner x52–76, y46–82, r3. Bars are 12 thick.
- **Strap inside the opening:** white x52–76, y54–74.
- **Prong:** amber capsule x46–96, y59–69.
- **Hole:** plate-colour circle at (103,64), r4.
- **Strokes:**

| Size | Frame bar | Strap | Prong | Gap |
|---|---|---|---|---|
| 128 | 12 | 20 | 10 | 4 |
| 48 | 5 | 8 | 4 | 2 |
| 32 | 3 | 6 | 3 | 1 |
| 16 | 2 | 4 | 2 | 1 |

- **16 px:**
```
................
................
.....WWWWWW.....
....WWWWWWWW....
....WW....WW....
....WW....WW....
WWW.WWWWWWWW.WWW
WWW.AAAAAAAAA.WW
WWW.AAAAAAAAA.WW
WWW.WWWWWWWW.WWW
....WW....WW....
....WW....WW....
....WWWWWWWW....
.....WWWWWW.....
................
................
```
- **Never crop the strap stubs.** Without them the frame reads as "8".

**3 · Loop: one belt loop on a strap holding one amber tool.** It is strongest at 16 px and is the template for module icons.
- **Strap:** white, y68–90.
- **Loop clearance:** plate colour, x46–82, y56–102, r10.
- **Loop ring:** outer x50–78, y60–98, r8. Inner x58–70, y68–90. Bars are 8 thick.
- **Tool:** amber capsule, 14×76, centred (64,64), rotated 18° clockwise.
- **Strokes:**

| Size | Tool | Strap | Loop bar |
|---|---|---|---|
| 128 | 14 | 22 | 8 |
| 48 | 5 | 8 | 3 |
| 32 | 4 | 6 | 2 |
| 16 | 2–3 | 2 | dropped |

- **16 px:**
```
................
................
..........AA....
.........AAA....
.........AA.....
........AAA.....
........AA......
.......AAA......
................
WWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWW
................
.....AAA........
.....AA.........
................
................
```

These pixel maps were rendered and checked once on #DFE3E7 and #1F1F1F. They are starting masters for a designer, not final art.

## Side panel checklist (P)

### Chrome-native frame

11. Use Chrome's own side-panel numbers:
    - 8 px body padding
    - tonal cards with 12 px radius, 16/8 px padding, 12 px inner gap, 8 px between cards
    - 16 px icons in 24 px icon buttons
    - section heading 36 px tall, 14/20 weight 500, with 11/16 metadata
    - 1 px hairlines at about 14% alpha
    - hover = 8% on-surface
    - disabled = 0.38
12. Surfaces close to Chrome's fallbacks:
    - **Light:** #FFFFFF / rgb(248,250,253) / rgb(243,246,252)
    - **Dark:** rgb(31,31,31) / rgb(39,40,42) / rgb(45,47,49)

    Follow `prefers-color-scheme`. Shadows only on floating layers (elevation-3 for overlays and dialogs, 12 px radius).
13. Scrollbars as in Chrome:
    - 8 px gutter, `scrollbar-gutter: stable`
    - thumb inset 1.5 px, fully rounded
14. The search bar is the header:
    - 36 px pill on surface1/2, pinned at the top
    - 16 px search icon and a `<kbd>` hint
    - the clear button (16 in 24) replaces the hint once text is typed
15. Search covers tools, actions, saved items and settings. An empty query shows Pinned → Recent (5) → Suggested for this site.
16. The `⋮` menu holds rare actions only. The header carries at most 2 icon buttons.

### Rail (right edge)

17. **Collapsed width: 48 px.**
    - 20 px icons in 36×36 targets, 4 px apart (≥24×24 per WCAG 2.5.8)
    - active = tonal pill + 2 px accent bar on the content side
    - badges = 6 px dot or a 16 px count pill
18. **Expanded width: 184 px** (168–208).
    - 36 px rows: icon, 12 px gap, label 13/20 weight 500, optional count 11/16
    - Material's touch rail (96 / 220–360 dp) is for reference only
19. **Order:** tools in user order → spacer → Lock → Settings → collapse toggle (last).
20. **Under 480 px panel width**, the expanded rail **overlays** content (elevation-3, faint scrim) and closes on select, Esc or an outside click. At **480 px and wider** it **pushes** content. Use container queries.
21. Read `chrome.sidePanel.getLayout()` (Chrome 140+). If the panel is on the left, mirror the rail to the left so it stays at the outer window edge. Default to right on older Chrome.
22. Save `railExpanded` in `chrome.storage.local`. Restore it before first paint, with no animation on restore.
23. Toggle:
    - a dock icon button with `aria-expanded` and the label "Show/Hide tool names"
    - the `[` key when not typing
    - a palette command
    - double-click on the rail border
24. Personalise: drag to reorder, hide tools, and choose dot or count for badges (the Linear and VS Code pattern).
25. Tooltips only on the collapsed rail (or on truncated labels):
    - **400 ms** before the first one, **0 ms** when moving between items within 300 ms, **100 ms** hide, **immediate** on keyboard focus
    - inverse surface, 12 px weight 500, padding 4×8, 6 px radius, 8 px from the rail, on the content side, no arrow
    - name plus dimmed shortcut
    - 120 ms fade + 2 px slide
26. Tooltip accessibility (WCAG 1.4.13 and APG):
    - dismissible with Esc, hoverable, and persistent while hovered
    - `role="tooltip"`, linked by `aria-describedby`
    - the button also has an `aria-label`
    - the tooltip never takes focus
27. Keyboard:
    - the rail is a vertical tablist: ↑/↓, Home/End, Enter/Space
    - `1–9` jump while the rail has focus. Avoid `Alt+digit` and `Ctrl+digit`, which switch tabs.
    - Ctrl/Cmd+K focuses search, and Esc closes overlays

### Responsive

28. Container-query breakpoints:

| Width | Mode | Layout |
|---|---|---|
| 320–399 | Compact | 32 px rows, one column, stat chips scroll sideways, secondary panes fold into disclosure rows |
| 400–519 | Regular | 40 px rows |
| 520–599 | Split | two columns where a tool has a natural pair |
| ≥600 | Roomy | content max 560 px, centred |

    Test at 320, 360, 420, 520 and 640 px, and at 200% zoom.

### Never boring

29. **Glance line** under every tool title, in Chrome-style 20 px chips with 11 px text, showing what changed or what needs you ("3 new today", "1 approval waiting"). Use a "was-updated" tint for fresh values.
30. **Two disclosure levels max:** summary card → expand in place → the tool's full tab.
31. **Context first:** each tool leads with what is relevant to the active tab.
32. **Pinned and Recent** at the top of every list. Recent shows 5 items with relative times.
33. **Speed is the delight:**
    - interactions under 100 ms (aim for 50)
    - paint from local data
    - switch tools instantly
    - no indicator under 1 s, a spinner or skeleton for 2–10 s, progress with an estimate beyond 10 s
34. **Design the peak and the ending of each tool:**
    - agent receipt "Done in 4 steps · 12 s", with ticks staggered 60 ms apart and ≤300 ms total
    - a new colour flashes once in Recent (700 ms)
    - Cairn: "Saved · 38 messages" plus undo
    - errors say what happened and what to do next
35. **Empty states** in Chrome's layout:
    - 288×144 art, 16/24 heading, 13/20 body
    - status + one teaching line + one action
    - art built from the logo's strap-and-tool construction
36. **Copy:** dry, rare humour only in empty states and success receipts. None in errors, permissions or agent approvals. Clarity beats wit.
37. **Delights that carry information:**
    - "Copied" state on copy buttons
    - swatch lift with its contrast ratio
    - a one-time badge fade-in
    - a single sync pulse
    - search placeholder built from the user's own counts
38. **Rhythm:** tonal cards over borders, **one** accent element per screen, tabular numbers, monospace for values only, aligned icon and label edges.
39. **Compact density** as a user switch (32 px rows).
40. **No novelty for its own sake:** no loops, confetti, streaks or random tips. Liveliness comes from the user's data and the page context.

### Fixes to sidepanel-v2.png

41. Replace the four-square logo in the rail with the new mark (20 px), or drop it and keep the toggle at the bottom.
42. Add glance lines and rail badges.
43. Turn the Formats and Recent sections into tonal cards.
44. Make the dark-mode two-column layout the ≥520 px rule.
