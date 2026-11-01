# 02 · Command palette and shortcuts

Question: what makes the Raycast, Linear and Superhuman palettes great, and how to avoid shortcut conflicts with claude.ai, chatgpt.com, Chrome and the `commands` API.

Researched 2026-10-31.

## TL;DR

- A great palette has five qualities. It opens from anywhere with one shortcut, it is the one place for every command, it covers nearly every action, it is forgiving about wording, and it is aware of context (Superhuman). It also teaches the shortcut for each command and ranks by frecency (Raycast).
- **Ctrl+K belongs to Chrome and to ChatGPT.** Chrome's own accelerator, which cannot be overridden by an extension command, is "Search from anywhere on the page". ChatGPT uses Ctrl/Cmd+K for chat search. DailyKit should own Ctrl+K only inside its own pages, and use a `commands` shortcut (suggested: **Alt+Shift+K**) to open the palette from any page.
- Chrome allows **at most 4 suggested shortcuts**. Each must include Ctrl or Alt, Ctrl+Alt is not allowed, and browser or OS shortcuts always win. Spend those 4 slots carefully and let users remap everything else.

## Findings

### What the best palettes do

**Superhuman** ([How to build a remarkable command palette](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)):
1. *Availability*: "Wherever your user is in your app, they must be able to bring up the command palette by using the same keyboard shortcut."
2. *Centrality*: "the one place where users can find every command."
3. *Omnipotence*: "A palette that only gives you access to a small set of commands is not very useful."
4. *Flexibility*: tolerate typos and add synonyms ("think of alternative words and phrases your users might use"). Rank so that "the top option is what the user is looking for," and use recency, such as the last used item in a list.
5. *Context*: "Show and hide commands based on what's currently active."
- It teaches as you use it: "instantly do any action, and also learn the shortcut for next time." All shortcuts can be found through Cmd+K, then "Shortcuts" ([help](https://help.superhuman.com/article/478-superhuman-command)).

**Raycast** ([Search Bar](https://manual.raycast.com/search-bar.md), [Action Panel](https://manual.raycast.com/action-panel.md)):
- The ranking order is fixed: **exact alias, then alias prefix, then fuzzy title match, then subtitle and keywords, then frecency**. Frecency mixes how often and how recently something was used, and the user can reset it per command ("Reset Ranking").
- **Favorites** fill an empty query, shown "in a dedicated section above all other results."
- **Aliases** are user-defined short keywords, shown as a tag next to the command. Typing an alias plus a space jumps to the command's first argument field.
- **Separate verbs from nouns:** Enter runs the primary action, and Cmd/Ctrl+K on a result opens its *Action Panel*, which has its own search. Every action shows its shortcut on the right.

**Linear** ([Invisible details](https://linear.app/now/invisible-details)):
- Right-click menus show the same actions with their shortcuts: "contextual menus are also a great tool for onboarding and teaching people how to use our popular keyboard shortcuts." `?` opens the list of shortcuts.
- Hover submenus have a "safe triangle", so moving diagonally toward a submenu doesn't close it. It took about 40 lines of code.

**NN/g on commands** ([UI copy](https://www.nngroup.com/articles/ui-copy/)): labels should be 2 to 4 words and start with a verb. Name the result, not the current state. Don't override standard shortcuts like Ctrl/Cmd+S. Let users remap, and show shortcuts in menus and tooltips.

### Shortcut constraints

| Constraint | Source |
|---|---|
| At most **4 suggested** shortcuts. Users can add more at `chrome://extensions/shortcuts`. | [chrome.commands](https://developer.chrome.com/docs/extensions/reference/api/commands) |
| Each must include Ctrl or Alt (Shift is optional). **Ctrl+Alt is not allowed** because of AltGr. | same |
| OS and Chrome shortcuts "always take priority and can't be overridden". If another extension already registered the combination, yours "won't register as expected". Check with `commands.getAll()` at install. | same |
| `_execute_action` opens the popup and does not fire `onCommand`. A command handler may call `sidePanel.open()`, because a command counts as a user gesture. | same + [sidePanel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) |
| Chrome uses **Ctrl+K / Ctrl+E**: "Search from anywhere on the page". | [Chrome keyboard shortcuts](https://support.google.com/chrome/answer/157179) |
| In Firefox, a combination the browser already uses (for example Ctrl+P) can be defined, but "your event handler will not be called". `_execute_sidebar_action` exists. Users remap in about:addons. | [MDN commands](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/commands) |

**Host-site shortcuts.** Neither company publishes an official list, so these come from third-party guides and need checking in each site's own shortcut dialog:
- chatgpt.com: Ctrl/Cmd+K = search chats, Ctrl+Shift+O = new chat, **Ctrl+Shift+S = toggle sidebar**, Ctrl+Shift+; = copy last code block, Ctrl+/ = shortcut list ([hongkiat](https://www.hongkiat.com/blog/chatgpt-keyboard-shortcuts/), [ai-toolbox](https://www.ai-toolbox.co/chatgpt-management-and-productivity/chatgpt-keyboard-shortcuts-guide)).
- claude.ai: Ctrl+Shift+O = new chat, **Ctrl+Shift+S = sidebar** and Ctrl+Shift+; = focus input according to one guide ([claudemaster](https://claudemaster.net/features/keyboard-shortcuts)), not confirmed.

**Conflicts in Cairn's current shortcuts:**
- `Ctrl/Cmd+Shift+S` (save) **collides with ChatGPT's sidebar toggle**, and probably claude.ai's too.
- `Alt+C` (dock) types "ç" on macOS (Option+C) and is AltGr territory on many European layouts. The AltGr point is the reason Chrome bans Ctrl+Alt.
- `Ctrl+Shift+H` (panic hide) opens the Library/History window in Firefox.
- Single keys (`/`, `j`, `k`, `f`, `?`) are safe only inside DailyKit's own pages, never while focus is on the host page.

## Recommendations for DailyKit

1. **One palette, three entry points.**
   - Inside DailyKit pages (side panel, dashboard, popup): **Ctrl/Cmd+K**, handled by the page itself. The extension page has focus, so Chrome's Ctrl+K doesn't fire there. Verify this.
   - From any web page: the `commands` shortcut **"Open command palette"**, suggested **Alt+Shift+K**. It calls `sidePanel.open()` and focuses the palette in the panel. No in-page overlay is needed.
   - From the popup: the search field at the top is the palette.
2. **Spend the 4 suggested Chrome shortcuts like this:** (a) open palette `Alt+Shift+K`, (b) open/toggle side panel `Alt+Shift+D`, (c) panic hide `Alt+Shift+H`, (d) left empty for a tool's main action, for example Cairn "Save chat" `Alt+Shift+S`. Everything else can be bound but has no default. Run `commands.getAll()` after install and flag any shortcut that came back empty, because that means another extension or the browser took it.
3. **Never `preventDefault` a host-site shortcut by default.** In-page tool shortcuts must use Alt+Shift+letter, and each one needs its own switch in the dashboard's shortcut list.
4. **Ranking:** exact alias, then alias prefix, then fuzzy title, then keywords/synonyms, then frecency, with a **context boost** (×1.5) for commands of the tool whose site is the active tab. An empty query shows: Pinned, then Recent (5), then "On this page" (context commands).
5. **Each result is a noun or a verb, never both.** Nouns are navigation ("Cairn › Saved", a saved chat, a setting). Verbs are actions ("Save chat", "Lock now"). Enter runs the primary action. **Ctrl/Cmd+Enter or →** opens an action list for the selected result, with its own search.
6. **Every command row shows its tool's icon, its label (verb first, 2 to 4 words), and its shortcut on the right** as `<kbd>`, so the palette teaches shortcuts. The same `<kbd>` appears in tooltips and context menus (Linear's approach).
7. **Settings are searchable from the palette.** Typing "dark", "density" or "auto-delete" opens the setting directly with that row highlighted (see 03).
8. **Synonyms and aliases** come from each tool's `module.ts`, for example `save` = keep, store, bookmark. Users can set their own aliases in the dashboard.
9. **Prefixes** for power users: `>` for commands only, `#` for tags (Cairn), `?` for help. The palette must work fully without them.
10. **`?` in any DailyKit page shows a list of shortcuts** built from the registry. It is the same data as the dashboard's Shortcuts page.

## Unverified or to check

- Whether Ctrl+K inside an extension side panel reaches the page or is caught by Chrome's address-bar search. Test in Chrome stable before committing.
- Current claude.ai and chatgpt.com bindings: open each site's shortcut dialog and record the list in the tool's module notes.
