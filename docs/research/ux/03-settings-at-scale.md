# 03 · Settings at scale and accessible reordering

Question: how to show many tools × many feature switches without overwhelming people, and how to make drag-to-reorder work from the keyboard.

Researched 2026-10-31.

## TL;DR

- Use progressive disclosure with **at most two levels**: the tool list, then a tool's detail. Show the few settings people change often first, and put the rest behind one clearly labelled "Advanced" section (NN/g).
- **Search is the third way in.** Every setting is findable from the dashboard search field and from Ctrl+K, by label, synonym and value.
- WCAG 2.2 SC 2.5.7 requires a **way to reorder without dragging**. Use a visible drag handle that is also a menu button ("Move up / Move down / Move to top"), plus Alt+↑/↓ on the focused row and a live-region announcement (Atlassian pattern).

## Findings

### Progressive disclosure (NN/g)
- "Initially, show users only a few of the most important options." Whatever is visible signals importance.
- Get the split right: everything people often need goes in the primary level.
- **Limit depth to two levels.** Three or more levels get people lost.
- Make the way to advanced options obvious and accurately labelled. Avoid multiple routes to the same secondary options.
- Base the split on evidence (frequency of use), not on guesses.
Source: [Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)

### Reordering accessibility
- **WCAG 2.2 SC 2.5.7 (AA)**: "All functionality that uses a dragging movement for operation can be achieved by a single pointer without dragging." The sortable-list example uses "adjacent controls for moving the element up or down." [Understanding 2.5.7](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html)
- **Atlassian Pragmatic drag and drop**: make drag handles visible. Put move actions in the item's "more" menu, or turn the handle itself into a menu button that "opens a menu that allows the users to move the item". Show a 2 px drop-indicator line, and **flash the moved item** (about 700 ms background flash) so people see what changed. [Design guidelines](https://atlassian.design/components/pragmatic-drag-and-drop/design-guidelines)

### Defaults and labels
- NN/g UI copy: label commands and settings by the outcome. A switch's label describes what happens when it is on ("Show Quote button on selected text"), not the current state. [UI copy](https://www.nngroup.com/articles/ui-copy/)
- Cairn already uses privacy-first defaults: "auto-save is off by default". Keep that stance shell-wide.

## Recommendations for DailyKit

### Structure (two levels, no more)

1. **Dashboard left nav** (as in the blueprint): Tools · Appearance · Shortcuts · Data & sync · Backups · About. That is six items and should stay six.
2. **Tools page = level 1.** One row per tool: grip, icon, name, one-line description, version, **master switch**, and an expand chevron. Collapsed is the default, and nothing more shows until the user asks.
3. **Expanded tool = level 2.** Show in this order:
   - **Features** (from `module.ts`): one switch row per feature, each with a one-line description under the label. Mark at most 5 features as `primary: true` and show them. The rest go under **"More features (n)"**.
   - **Settings**: the same rule, primary first, then **"Advanced (n)"**.
   - **Sites and permissions**: which sites the tool runs on, permission status, and a "Grant access" button when needed (see 04).
   - **Data**: rows stored, sync on/off for this tool, migration version, and "Export this tool's data".
4. **No third level.** If a setting needs its own page (for example Cairn snippets), it is *content*, not a setting. It goes in the tool's side-panel tab, and the dashboard links there.
5. **Global vs per-tool.** Global settings are appearance, shortcuts, sync connection and backups. Per-tool settings are features, sites and the tool's own options. A per-tool setting never overrides a global one, with one exception: tools may *opt out* of sync. Don't build "use global / custom" overrides for appearance, because themes stay global (tokens only).

### Search in settings

6. A search field at the top of the dashboard, focused with `/`. It searches label, description, synonyms (`keywords` in the setting schema) and current value. Results show a breadcrumb (`Cairn › Advanced › Auto-delete after`). Opening a result expands that tool, scrolls to the row and gives it the 700 ms highlight flash.
7. The same index feeds Ctrl+K ("Settings" group).

### Switch behaviour

8. **Switches apply instantly**, with no Save button. Each switch has optimistic UI and shows an inline error with the switch reverted if storage fails.
9. **When a master switch is off, its features stay visible but are dimmed and inert**, with the text "Turn on Cairn to change these." Hiding them would make the tool look empty.
10. **Turning a tool off is reversible and loses no data.** The toast says "Cairn turned off. Your saved chats are kept. [Undo]". Deleting data is a separate, explicit action under Data.
11. **Defaults** are written in `module.ts` and shown with a "Reset to default" link that appears only when the value differs. A "Reset this tool's settings" action lives at the bottom of Advanced and offers undo.

### Reorder

12. Grip handle (`⋮⋮`), always visible, is **a button** with `aria-label="Reorder Cairn"`. Click or Enter on it opens a menu: Move up · Move down · Move to top · Move to bottom.
13. On a focused row, **Alt+↑ / Alt+↓** moves the row. Focus stays on the moved row.
14. After any move, announce through `aria-live="polite"`: "Cairn moved to position 2 of 4." The moved row gets the 700 ms flash. A 2 px accent line shows the drop target while dragging.
15. Show the result order immediately where it matters. The blueprint says order sets the side panel and popup, so show a tiny rail preview next to the list.

## Unverified or to check
- The "max 5 primary features" threshold is a starting point, not a researched number. Revisit it once usage data exists. NN/g says the split should rest on frequency data.
