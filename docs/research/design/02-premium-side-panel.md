# 02 · A premium, Chrome-native side panel that holds a lot without feeling boring

Questions:
1. What do Chrome's own side panels look like, measured from source?
2. How should a collapsible tool rail on the right edge behave (expanded vs collapsed, persistence, toggle, tooltips, keyboard)?
3. How do dense tools stay engaging rather than tiring?

Researched 2026-11-01. This builds on `docs/research/ux/01-side-panel.md` and `07-premium-feel.md`, and does not repeat their motion budget or type rules.
- **Strongest primary source:** Chromium's own side-panel and WebUI CSS, which gives the exact numbers Chrome uses.
- **Other sources:** the androidx Material 3 source, WCAG 2.2, WAI-ARIA APG, Apple HIG, NN/g, and the Linear, Raycast and Superhuman write-ups.
- Claims not checked against a primary source are marked **(unverified)**.

Context: `docs/design/sidepanel-v2.png` already has search on top, a right-hand rail (logo, 4 tools, lock, settings), a tool header with a count, and a sync footer. The rules below refine that design. They do not replace it.

---

## 1. What "Chrome-native" means, in numbers

Chrome's side panels (Reading list, Bookmarks and others) share one stylesheet: `chrome/browser/resources/side_panel/shared/`. Matching these values is the most direct way to stop the panel feeling like a website.

| Token | Chrome value | Source |
|---|---|---|
| Body padding (panel edge to card) | **8 px** | [sp_shared_vars.css](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/resources/side_panel/shared/sp_shared_vars.css) |
| Card inline padding / block padding | **16 px / 8 px** | same |
| Gap inside a card | **12 px** | same |
| Gap between cards | **8 px** | [sp_shared_style.css](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/resources/side_panel/shared/sp_shared_style.css) |
| Card radius | **12 px**, on a "side-panel card background" colour (a tonal surface, not a border) | same |
| Dialog radius / shadow | 12 px / `--cr-elevation-3` | same |
| Scrollbar | 8 px gutter with `scrollbar-gutter: stable`, thumb inset by a 1.5 px transparent border, fully rounded | same |
| Icon buttons in rows and headers | **16 px icon in a 24 px button**, 12 px apart | same, [sp_heading.css](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/resources/side_panel/shared/sp_heading.css) |
| Section heading | **36 px tall. Title 14 px / 20 px, weight 500**, one line with ellipsis. Metadata 11 px / 16 px, secondary colour | sp_heading.css |
| Back button | fades with a 200 ms opacity transition | sp_heading.css |
| Empty state | illustration box 288×144, heading **16/24 weight 500** (max 259 px wide), body **13/20** (max 229 px), 12 px spacing | [sp_empty_state.css](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/resources/side_panel/shared/sp_empty_state.css) |
| List badge / chip | **20 px tall pill, 11 px text**, 12 px icon, padding 4 8 4 6. It has a `was-updated` colour state and can strike through the previous value | [sp_list_item_badge.css](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/resources/side_panel/shared/sp_list_item_badge.css) |
| WebUI base | icon 20 px, icon ripple 36 px, button height 36 px, row min height 48 px (64 px for two lines), toolbar 56 px, hairline 1 px at 14% alpha, disabled opacity 0.38, hover 8% of on-surface | [cr_shared_vars.css](https://chromium.googlesource.com/chromium/src/+/main/ui/webui/resources/cr_elements/cr_shared_vars.css) |
| WebUI tooltip | **500 ms show delay, 600 ms hide delay**, fade in and out | [cr_tooltip.ts](https://chromium.googlesource.com/chromium/src/+/main/ui/webui/resources/cr_elements/cr_tooltip/cr_tooltip.ts) |
| Search field | 16 px search icon. 16 px clear icon in a 24 px button, which appears only when there is text | [cr_search_field.css](https://chromium.googlesource.com/chromium/src/+/main/ui/webui/resources/cr_elements/cr_search_field/cr_search_field.css) |

Fallback surfaces (cr_shared_vars):
- **Light:** surface #FFFFFF, surface1 rgb(248,250,253), surface2 rgb(243,246,252), on-surface rgb(31,31,31), on-surface-variant rgb(68,71,70), primary rgb(11,87,208).
- **Dark:** surface rgb(31,31,31), surface1 rgb(39,40,42), surface2 rgb(45,47,49), on-surface rgb(227,227,227), primary rgb(168,199,250).

**Fonts:** Chrome WebUI uses the platform UI font. On Linux it imports Roboto, and on other platforms a per-locale system stack is injected ([text_defaults_md.css](https://chromium.googlesource.com/chromium/src/+/main/ui/webui/resources/css/text_defaults_md.css)). The panel is cobalt on a neutral bench; Toolbelt's chosen UI font is Schibsted Grotesk. **Decision for the user:** use `system-ui` for the frame (search, rail, headings) to feel native, or keep Schibsted everywhere for brand. Chrome's guidance asks the panel to match the extension's "logo, colors, icons, and fonts" ([side panel launch post](https://developer.chrome.com/blog/extension-side-panel-launch)), so either is defensible.

**Theme:** extensions can't read the user's Chrome theme colour. As far as found, Chrome has no `theme` read API for extensions **(unverified)**. Follow `prefers-color-scheme` and use neutral surfaces close to Chrome's fallbacks, so the panel sits naturally next to Chrome's own panels.

**Other platform facts worth using:**
- `chrome.sidePanel.getLayout()` (Chrome 140+) returns `side: "left" | "right"`. Users pick the side in Chrome settings ([sidePanel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel)).
- `close()` arrived in Chrome 141, `onOpened` in 141 and `onClosed` in 142.
- Earlier research found the minimum panel width is 360 px since Chrome 120 (`ux/01`). Still lay out down to **320 px** for Edge, Firefox and older Chrome.

## 2. Header and search

1. **The search bar is the header.**
   - Pin it at the top: 36 px tall inside an 8 px body padding, fully rounded (pill), on surface1/2.
   - 16 px search icon, a `<kbd>` hint on the right, and the clear button replaces the hint once the user has typed.
   - This matches Chrome's own 16 px search icon and 24 px clear button.
2. **Search scope is everything:** tools, actions, saved items (colours, chats) and settings. With an empty query, show **Pinned → Recent (5) → Suggested for this site** (the ranking from `ux/02`). Raycast made its search bar "bigger to reflect its importance" ([Raycast](https://www.raycast.com/blog/a-fresh-look-and-feel)). Superhuman: Cmd+K "to find what you need in seconds when you don't know the shortcut" ([Superhuman](https://blog.superhuman.com/superhuman-is-built-for-speed/)).
3. **Tool header:** 36 px tall, title 14/20 weight 500, metadata 11/16 on the right ("24 saved"). Up to two 16-in-24 icon buttons. These are Chrome's `sp-heading` numbers exactly.
4. Use the **overflow menu (⋮)** for rare actions only. Don't fill the header.

## 3. The tool rail (right edge, collapsible)

### Geometry
Material 3's own tokens, from the androidx source:
- Collapsed rail **96 dp** (narrow 80 dp).
- Expanded rail **220–360 dp**, 44 dp top space, 4 dp between items.
- Expanding animates the width ([NavigationRailCollapsedTokens](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/NavigationRailCollapsedTokens.kt), [NavigationRailExpandedTokens](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/NavigationRailExpandedTokens.kt), [WideNavigationRail.kt](https://github.com/androidx/androidx/blob/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/WideNavigationRail.kt)).

Those numbers are for touch tablets. A 360 px panel needs desktop density. Chrome's own densities are a 20 px icon, a 36 px ripple and a 48 px row. WCAG 2.2 sets a 24×24 CSS px minimum target ([2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).

Recommended:
- **Collapsed: 48 px wide.** 20 px icons in 36×36 hit areas, 4 px apart.
  - Active item: tonal pill (primary-container) plus a 2 px accent bar on the content side. sidepanel-v2 already does this.
  - Badge: a 6 px dot, or a 16 px count pill at the top-right of the icon.
- **Expanded: 184 px** (clamp 168–208). Rows are 36 px with the 20 px icon, a 12 px gap and the label at 13/20 weight 500, plus an optional right-aligned count in 11/16.
- **Order:** search lives in the header, not the rail. Top to bottom: tools in user order, then a flexible spacer, then *Lock*, *Settings*, then the **collapse toggle** last.

### Expanded vs collapsed by width
Material's modal wide rail "blocks interaction with the rest of an app's content with a scrim. It is elevated above the app's UI and doesn't affect the screen's layout grid" (WideNavigationRail.kt). Use that idea:

| Panel width | Collapsed rail | Expanded rail |
|---|---|---|
| < 480 px | docked, 48 px | **overlays** content (elevation-3, 12 px radius on the inner corners, faint scrim). Closes on selection, Esc or an outside click |
| ≥ 480 px | docked, 48 px | **pushes** content (docked 184 px). Content reflows; no scrim |

Use **container queries** on the panel root, not media queries.

### Side
Read `sidePanel.getLayout()`:
- Panel on the right: rail on the right (outer window edge).
- Panel on the left: **mirror the rail to the left**, so the rail always sits at the browser's outer edge and content stays next to the page.

This rule is a design inference, not a source. Fall back to right on Chrome < 140.

### Persistence and toggle
- Save `railExpanded` in `chrome.storage.local`, restore it before first paint, and never animate on restore. Linear "will remember which sections the user collapsed across sessions" ([Linear changelog 2019](https://linear.app/changelog/2019-11-11-new-sidebar)). Its full collapse uses a `[` shortcut, a click on the sidebar border, or "Collapse" in the command menu ([Linear changelog](https://linear.app/changelog/unpublished-collapsible-sidebar), an unpublished entry, so **treat as unverified**).
- Toggle: a 16-in-24 "dock" icon button at the bottom of the rail with `aria-expanded`. Its label is "Show tool names" / "Hide tool names".
  - Shortcut: **`[`** when focus is not in a text field (matches Linear).
  - Add a palette command "Toggle tool names".
  - Double-clicking the rail's inner border also toggles.
- Personalise: drag to reorder, hide unused tools, and choose "dot or count" for badges. Linear's personalised sidebar lets users "reorder items, hide items you don't use often" and pick a numeric badge or simple marker ([Linear](https://linear.app/changelog/2024-12-18-personalized-sidebar)). VS Code's activity bar lets you "show or hide views by right-clicking ... and reorder them by using drag and drop" ([VS Code UI](https://code.visualstudio.com/docs/getstarted/userinterface)).

### Tooltips (collapsed rail only)
- **Timing:**
  - Chrome WebUI: 500 ms in, 600 ms out (cr_tooltip).
  - Fluent UI: 250 ms show, 250 ms hide ([Tooltip.types.ts](https://github.com/microsoft/fluentui/blob/master/packages/react-components/react-tooltip/library/src/components/Tooltip/Tooltip.types.ts)).
  - Radix: 700 ms delay, then a 300 ms "skip delay" window in which the next tooltip opens instantly ([tooltip.tsx](https://github.com/radix-ui/primitives/blob/main/packages/react/tooltip/src/tooltip.tsx)).
  - **Use 400 ms for the first tooltip, 0 ms while moving between rail items within 300 ms, and 100 ms to hide.** On keyboard focus, show immediately.
- **Rules (WCAG 1.4.13, [content on hover or focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)):**
  - **Dismissible** with Esc without moving the pointer.
  - **Hoverable**, so the pointer can move onto the tooltip.
  - **Persistent** until hover or focus leaves.
- **APG:** the tooltip "has role tooltip". The trigger references it with `aria-describedby`. "Tooltip widgets do not receive focus" ([APG Tooltip](https://www.w3.org/WAI/ARIA/apg/patterns/tooltip/)). The rail button also needs an `aria-label`, since the tooltip is only a description.
- **Styling:**
  - Placed on the content side of the rail, vertically centred on the icon, 8 px away.
  - Inverse surface (dark in light mode), 12 px text at weight 500, padding 4 × 8, 6 px radius.
  - Shortcut shown as a dimmed `<kbd>` ("Colour picker · Alt+Shift+C").
  - Opacity plus a 2 px slide toward the content, 120 ms. No arrow.
- **Expanded rail:** no tooltips, because the labels are visible. Show one only if a label is truncated.

### Keyboard
The rail is a vertical tablist (`ux/01`):
- ↑/↓ move between tools, Home/End jump to first and last, Enter or Space activate.
- `Alt+1…9` jumps to the nth tool from anywhere in the panel.
- `[` toggles names, Ctrl/Cmd+K focuses search, and Esc closes the overlay rail or palette.

## 4. Responsive layout (320 → 600+ px)

Container-query breakpoints on the panel root (content width = panel − rail):

| Panel width | Layout |
|---|---|
| 320–399 | **Compact.** One column, 32 px rows, the stat strip scrolls horizontally, and secondary columns (formats table, model picker) fold into disclosure rows. |
| 400–519 | **Regular.** One column, 40 px rows, stat chips wrap to 2 lines max. |
| 520–599 | **Split.** Two columns where a tool has a natural pair: the colour value beside formats, or the chat list beside a preview. The expanded rail can dock. |
| ≥ 600 | **Roomy.** Max content width 560 px, centred, with extra space going to gutters, never to wider text lines. |

Test at 320, 360, 420, 520 and 640 px, plus 200% zoom.

## 5. Staying engaging with a lot of information

Engaging is not the same as busy. Apple puts it well: "Sparse layouts can make the widget seem unnecessary, while overly dense layouts are less glanceable. Create a layout that provides essential information at a glance and allows people to view additional details by taking a longer look" ([HIG Widgets](https://developer.apple.com/design/human-interface-guidelines/widgets)). The tactics below each tie to a source or to an observed product pattern.

1. **A glance line on every tool.** The top of each tool is a one-line summary of what changed, in Chrome's 20 px badge style (11 px text):
   - "24 colours · 3 new today"
   - "Agent waiting for 1 approval"
   - "Saved 2 chats from claude.ai"

   Chrome's own badge has a `was-updated` state and can strike through the old value, which is how Chrome shows a change ([sp_list_item_badge.css](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/resources/side_panel/shared/sp_list_item_badge.css)).
2. **Progressive disclosure, two levels max.** The first view shows only "a few of the most important options". "Designs that go beyond 2 disclosure levels typically have low usability" ([NN/g](https://www.nngroup.com/articles/progressive-disclosure/)). Pattern: summary card → expand in place (a disclosure row) → full view in the tool's tab. Never a third level.
3. **Context first.** The panel follows the active tab (`ux/01`). Lead each tool with what is relevant to *this page*: on claude.ai, Cairn shows "This chat: not saved yet". On any page, the agent's first chip says what it can see. Freshness tied to what the user is doing beats decoration.
4. **Recent and pinned at the top of lists.** Pin with a hover pin icon or `P`. Recent shows the last 5 with relative times ("2 min ago"). Linear and VS Code both let users reorder and hide (above). Personalisation is engagement the user builds themselves.
5. **Speed is the delight.**
   - Superhuman: "every digital interaction should be faster than 100ms", and it "aims for latency less than 50ms whenever possible". It uses "minimal animations" and preloads likely next views ([Superhuman](https://blog.superhuman.com/superhuman-is-built-for-speed/)).
   - Paint from local data and switch tools in 0 ms (`ux/07`).
   - NN/g: under 1 s needs no indicator. Spinners or skeletons for 2–10 s. Progress with an estimate beyond 10 s ([skeleton screens](https://www.nngroup.com/articles/skeleton-screens/)).
6. **Peaks and endings.** People remember "intense positive or negative moments ... and the final moments" ([NN/g peak-end](https://www.nngroup.com/articles/peak-end-rule/)). Design the peak of each tool deliberately:
   - **Agent:** the finished task shows a compact receipt ("Done in 4 steps · 12 s") with each step's tick appearing in sequence, 60 ms apart, total ≤ 300 ms.
   - **Colour picker:** a new colour drops into Recent with the 700 ms "changed" flash (`ux/07`).
   - **Cairn:** "Saved · 38 messages" plus an undo link.
   - **Errors:** "Explain what the problem is and offer a reasonable estimate" (same source).
7. **Empty states that teach.** Use Chrome's sizes (a 288×144 illustration box, 16/24 heading, 13/20 body), one sentence of status, one line of teaching and one action (`ux/01`). Use the logo's construction for illustrations, for example the tool tucked into the strap, so empty states extend the brand and don't look like generic clip-art.
8. **Personality in copy: dry, rare, never in the way.** Mailchimp: "Our humor is dry"; "don't go out of your way to make a joke ... If you're unsure, keep a straight face"; "it's always more important to be clear than entertaining" ([Mailchimp voice and tone](https://styleguide.mailchimp.com/voice-and-tone/)).
   - Allowed: one light line in empty states and success receipts.
   - Never: in errors, permissions or the agent's approval card.
9. **Small, information-carrying delights** (all within the `ux/07` motion budget):
   - A copy button that turns into "Copied".
   - A swatch that lifts 1 px on hover and shows its contrast ratio.
   - The rail badge dot fades in once when something new arrives.
   - The sync dot pulses **once** on success, never in a loop.
   - The search placeholder rotates through real examples from the user's own data ("Search 24 colours, 61 chats…").
10. **Visual rhythm, not walls.**
    - Group with Chrome's tonal cards (12 px radius, 8 px between cards) rather than borders everywhere.
    - At most **one** card with an accent per screen (the primary action or approval).
    - Numbers in tabular figures.
    - Monospace only for values (HEX, code).
    - Linear credits alignment of "labels, icons, and buttons, both vertically and horizontally" for a calm, dense UI, together with keeping the accent colour out of neutral surfaces ([Linear redesign](https://linear.app/now/how-we-redesigned-the-linear-ui)).
11. **A compact mode for power users.** Raycast's Compact Mode gives "a minimal appearance" ([Raycast](https://www.raycast.com/blog/a-fresh-look-and-feel)). Toolbelt's 32/40 px density token is that switch.
12. **No novelty for its own sake.** No looping animation, confetti, streaks or random tips. Change has to come from the user's data (new items, page context, completed work). That is what keeps a dense panel feeling alive instead of decorated.

**Products to study hands-on (behaviour observed, not documented in sources fetched here, so unverified):**
- **Arc:** the sidebar hides and peeks on edge hover.
- **Chrome's own Reading mode and Gemini panels:** the header and search treatment.
- **Things:** a calm list density with one accent.

## 6. Notes on sidepanel-v2.png

- **Good:** the right rail with an accent bar, search with a `<kbd>` hint, the header with a count, the one-line sync footer, and the agent approval card with three clear buttons.
- **Change:**
  - Replace the four-square logo at the rail top with the new mark at 20 px, or remove it and put the collapse toggle at the bottom.
  - Add a glance line under each tool title.
  - Group "Formats" and "Recent" as tonal cards (Chrome's 12 px radius on surface1) instead of a bordered table.
  - Add rail badges.
  - At the dark-mode width the two-column split already works. Make it the ≥ 520 px rule.

## Open questions
- Whether to use `system-ui` or Schibsted Grotesk for the frame (section 1).
- Whether Chrome exposes the user's theme colour to extensions (assumed no, **unverified**).
- The exact widths of Chrome's side panel header and its built-in resize range in current Chrome (not measured).
