# 01 · Side panel UX

Question: what the Chrome side panel API allows (width, per-tab vs global panels, opening rules), how to navigate many tools in a narrow panel, and what empty states should do.

Researched 2026-10-31. Mockup used: `docs/design/dailykit-blueprint.html` (side panel with the Cairn tabs Now / Insert / Saved, and `Ctrl K` in the header).

## TL;DR

- Design for a **360 px** wide panel that the user can resize. The extension cannot set the width. Chrome 120 raised the minimum from 320 px to 360 px.
- Use **one global panel** (the default, no `tabId`) whose content follows the active tab. Per-tab panels are separate document instances, so their state is lost and they break the idea of a single home.
- `sidePanel.open()` needs a user gesture. The four allowed gestures are a toolbar click, a keyboard command, a context menu item, and a click inside an extension page or content script. You cannot open the panel on page load.
- Navigation: **a 44 px icon rail for tools, plus each tool's own tab bar at the top.** Never stack two rows of tabs. With only one tool enabled, hide the rail.
- Empty states have three jobs (NN/g): say what the state is, teach the feature, and give one direct action.

## Findings

### API constraints (Chrome)

| Fact | Source |
|---|---|
| Side panel needs Chrome 114+, MV3 and the `"sidePanel"` permission. | [sidePanel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) |
| `setOptions({tabId})` applies only to that tab. Leaving out `tabId` sets the default for every other tab. "The panel for this tabId will be a different instance than the panel for the default tabId." | same |
| "When a user temporarily switches to a tab where the side panel is not enabled, the side panel will be hidden." | same |
| `open()` "may only be called in response to a user action" (Chrome 116+). Allowed triggers: action click, keyboard shortcut, context menu, user gesture on an extension page or content script. | same |
| `setPanelBehavior({openPanelOnActionClick})` defaults to `false`. When `true`, clicking the toolbar icon toggles the panel, and the popup is no longer reachable from that click. | same |
| `close()` arrived in Chrome 141, `onOpened` in 141, `onClosed` in 142, and `getLayout()` (left or right side) in 140. The user picks the side in Chrome settings. | same |
| There is no width API. The minimum inner width went from 320 to 360 px in Chrome 120, a change Chrome DevRel (Oliver Dunk) confirmed. The Chrome team said it was "continuing to discuss" whether to give extensions more flexibility, with no API since. | [chromium-extensions thread](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/xuk4ZuWTsBk), [width question](https://groups.google.com/a/chromium.org/g/chromium-extensions/c/UcHL2GmjHiI) |
| Chrome's guidance: the panel is "a companion surface ... alongside the content they are browsing". It should match the extension's branding, follow the single-purpose policy, and appear only where relevant. Onboarding should live inside the extension. | [Side Panel launch post](https://developer.chrome.com/blog/extension-side-panel-launch) |

### Firefox differences

- Firefox uses `sidebar_action` and the `sidebarAction` API, not `sidePanel`. Each window loads its own instance, and `setPanel()` can set a document for one tab. The document unloads when the sidebar closes. The sidebar **opens automatically the first time the extension is installed.** [MDN Sidebars](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/user_interface/Sidebars)
- Firefox has a special `_execute_sidebar_action` command that opens the sidebar from a shortcut. [MDN commands](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/commands)
- Effect on DailyKit: the shell must not assume the panel stays alive. Restore view state from storage every time the panel opens, on both browsers.

### Navigation patterns in a narrow panel

- At 360 px, a row of 5 or more text tabs overflows. The blueprint already uses one tab row for Cairn's own tabs (Now / Insert / Saved). Adding a second row of tool tabs would give two competing tab bars, which goes against NN/g's advice to keep disclosure to at most two levels and to have only one route to secondary content ([progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/)).
- Material's navigation-rail component is meant for a small number of top-level destinations at medium widths. Its compose docs list `NavigationBar` with up to 5 destinations and `NavigationRail` for medium sizes ([Material 3 in Compose](https://developer.android.com/develop/ui/compose/designsystems/material3)). Users of Arc, VS Code and Slack already know a vertical rail of tool icons with content beside it.
- Options compared:

| Pattern | Cost at 360 px | Scales to | Verdict |
|---|---|---|---|
| Top tabs for tools + sub-tabs | Two tab rows, about 80 px of height | about 4 tools | No |
| Header switcher (dropdown) | 0 px | any number | Hides the other tools, so switching takes 2 steps. Good as a fallback. |
| Icon rail (44 px) | 12% of the width | about 8, then a "More" item | **Yes**: one click, always visible, and leaves the top tab bar to the tool |

- Tabs inside a tool should follow the WAI-ARIA tabs pattern: arrow keys move between tabs, Home and End are optional, and tabs activate automatically only when the panel content shows without delay ([APG Tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/)). Treat the rail as a vertical tablist, so Up and Down arrows move along it.

### Empty states (NN/g)

1. **Communicate status.** Never leave a container blank, and don't show "No records" while data is still loading.
2. **Teach.** Use the space to explain the feature. The example given is "Star your favorites to list them here."
3. **Give a direct pathway**: one button that starts the task.
Source: [Designing Empty States in Complex Applications](https://www.nngroup.com/articles/empty-state-interface-design/)

## Recommendations for DailyKit

1. **Single global panel.** Don't call `setOptions({tabId})` per tab. The panel listens to `tabs.onActivated` and `tabs.onUpdated`, then tells each tool about the context ("you are on claude.ai, private chat").
2. **Layout:** a 44 px rail on the side next to the page. Read `getLayout().side` to find it, and fall back to a left rail. Rail order is the order set by drag in the dashboard. Each tool's tab bar sits in the header strip. Settings and the dashboard link go at the bottom of the rail.
3. **One tool enabled means no rail.** The panel then reads as the tool itself, so a buyer of standalone Cairn sees the same panel without the shell.
4. **Never switch tools for the user.** When the active tab matches a tool's sites, show a 6 px accent dot on that tool's rail icon and a one-line "Cairn is active on this page" chip in its header. The user stays where they were.
5. **Design for 360 px first, then let it grow.** Test layouts at 360, 420 and 600 px. Above 520 px, Cairn's Saved tab can switch to a list + reader split.
6. **Persist each tool's last tab and scroll position** in `storage.session`, so it survives the panel closing on Firefox and Chrome.
7. **Opening:** use `openPanelOnActionClick: true` only if the popup goes away. Because the popup is a decided surface, keep the toolbar click for the popup, give the popup an "Open panel" button (a user gesture, so `open()` is allowed), and add a `commands` shortcut (see 02).
8. **Empty states per tool**, written as sentences, each with one action. For example, Cairn Saved: "Chats you save from Claude incognito or ChatGPT temporary chats appear here. [Open a private Claude chat]". A tool with no context on the current page shows what it can do on this page, or one line naming the sites it works on.
9. **Loading:** cached data shows instantly (local-first). Show skeleton rows only for things fetched from the network, and never an empty-state message while a load is still running.

## Unverified or to check

- The exact current minimum width. The forum thread says 360 px; vendor blogs say 320 px in 2026. Measure it in the target Chrome version.
- Whether opening the side panel counts as an `activeTab` invocation. The activeTab docs list action, context menu, command and omnibox, but not the side panel ([activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)).
