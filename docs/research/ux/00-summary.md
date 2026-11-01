# DailyKit UX rules (summary)

Concrete, opinionated rules drawn from the research in `01` to `07`. Each rule points to the file with its sources. Researched 2026-10-31 against Chrome developer docs, Chrome Web Store policy, NN/g, WCAG 2.2, Apple HIG, Material, and the Raycast, Linear, Superhuman, Atlassian, 1Password and Grammarly docs.

## Two things to decide first

- **A. Store single-purpose policy.** Chrome Web Store: "An extension must have a single purpose that is narrow and easy to understand" and "Broad, multi-purpose toolbars are not allowed." A public listing of the DailyKit bundle risks rejection unless its purpose is framed narrowly (for example "tools for AI chat sites"). Selling tools standalone is the policy's own recommendation. Decide whether the bundle is listed publicly, unlisted, or private. (04)
- **B. Ctrl+K belongs to Chrome ("Search from anywhere on the page") and to ChatGPT (chat search).** DailyKit uses Ctrl+K only inside its own pages, and a `commands` shortcut (Alt+Shift+K) everywhere else. (02)

## The checklist

### Side panel (01)
1. Design for **360 px** width (Chrome 120+ minimum; no width API) and test at 360 / 420 / 600 px.
2. Use **one global panel**, not per-tab panels, because per-tab panels are separate instances that lose state. Its content follows the active tab.
3. Navigation: a **44 px icon rail** of tools (order comes from the dashboard), plus **one** tab bar per tool. Never stack two rows of tabs. With **one tool enabled, hide the rail**.
4. Never switch tools for the user. Mark context with a dot on the rail icon and a one-line chip.
5. Save each tool's last tab and scroll position, and restore on open. Firefox unloads the sidebar on close.
6. `sidePanel.open()` only from a gesture: the popup's "Open panel" button, a command, a context menu, or a click in a DailyKit page. Keep the toolbar click for the popup.
7. Every empty state has a status sentence, one line of teaching, and **one** action button. Never show "nothing here" while loading.

### Command palette and shortcuts (02)
8. One palette: **Ctrl/Cmd+K** inside DailyKit pages, **Alt+Shift+K** command from any page (opens the panel with the palette focused). No in-page palette overlay.
9. The 4 Chrome suggested shortcuts:
   - Palette `Alt+Shift+K`
   - Side panel `Alt+Shift+D`
   - Panic hide `Alt+Shift+H`
   - One tool's main action (Cairn save `Alt+Shift+S`)

   Everything else is user-assignable. Check `commands.getAll()` after install and flag shortcuts that didn't register.
10. Change Cairn's current bindings:
    - `Ctrl+Shift+S` collides with the ChatGPT and Claude sidebar toggles.
    - `Alt+C` types "ç" on macOS.
    - `Ctrl+Shift+H` opens Firefox's history Library.
11. Never `preventDefault` a host-site shortcut. Single-key shortcuts (`/ j k f ?`) only inside DailyKit pages.
12. Ranking: exact alias → alias prefix → fuzzy title → keywords/synonyms → frecency, with a context boost for the active site's tool. Empty query shows Pinned → Recent (5) → On this page.
13. Results are a noun (go to) or a verb (do). Enter runs the primary action. Ctrl/Cmd+Enter or → opens a searchable action list.
14. Every row shows tool icon, verb-first label (2 to 4 words), and its `<kbd>` shortcut. The palette is how shortcuts get learned. Settings are searchable from it.
15. `?` in any DailyKit page lists every shortcut, built from the module registry.

### Settings at scale (03)
16. **Two levels only:** the tool list, then the expanded tool. Anything deeper is content in the tool's panel tab.
17. Expanded tool order: Features (up to 5 primary, then "More features (n)") → Settings (primary, then "Advanced (n)") → Sites and permissions → Data.
18. Global settings: appearance, shortcuts, sync connection, backups. Tools never override appearance. Tools may opt out of sync.
19. Switches apply instantly (no Save button). Switch labels describe the "on" outcome. When a master switch is off, its features show dimmed with "Turn on Cairn to change these".
20. A settings search (`/`) covers label, description, keywords and value, shows a breadcrumb, then jumps to the setting and flashes it for 700 ms. The same index feeds Ctrl+K.
21. Reordering meets WCAG 2.5.7:
    - The grip is a button with the menu Move up / down / top / bottom.
    - **Alt+↑/↓** moves the focused row.
    - Each move is announced with `aria-live`, as in "Cairn moved to position 2 of 4".
    - The moved row flashes once, and a 2 px drop line shows where it will land.

### Onboarding, permissions, privacy (04)
22. First run is **one dashboard card**, no tour:
    - One sentence on where data lives
    - Pin-the-icon hint
    - "Open side panel" button
    - Tool switches
    - Palette shortcut with "Change"
23. Each tool shows a single first-use tip in context. After that, the tip lives in its Guide tab.
24. All site access goes in **`optional_host_permissions`** and is requested from a button on the tool's card at first need. A declined request leaves a calm card, with no nagging.
25. **Never add a required permission in an update**, because Chrome disables the extension until the user accepts. Handle `permissions.onRemoved` with an "Allow again" card.
26. Every list and item says where its data lives in words: "This device" / "Synced".
27. Turning on sync is a prominent-disclosure screen: which tools, which data, per-tool checkboxes (none checked by default), and a button that names the action ("Start syncing Cairn").
28. State the limits honestly. For example: "The passcode lock hides the library; chats are not encrypted."
29. Trust: visible versions plus changelog, a permissions-explained page (the same text as the listing and the Limited Use statement), and **export never paywalled**. Show no countdown or upgrade banners. Mention upsell only at the locked feature.

### In-page UI (05)
30. Default to **no in-page UI**. Show it only for a page *state*: private chat → Save chip, selection → Quote, `{{` → snippet.
31. Retire the always-on round dock in favour of the side panel. If it stays, it is an opt-in feature.
32. The shell owns **one in-page slot per page**. Attach to host controls with `anchor` + `autoMount`. Never cover the composer or the send button.
33. Use a Shadow root for every element, with sizes in px (`rem` follows the host). Use an iframe for anything that shows saved data or takes a passcode. Make UI SPA-safe and match the host's light or dark mode.
34. Every element's `⋯` menu offers Hide for now / **Don't show on this site** (kept, with an undo toast, listed in the dashboard) / Settings. Avoid 1Password's mistake of a hide that only lasts until restart.
35. Nothing is ever sent for the user. Snippet fill always needs a second Enter.

### Feedback, sync, errors (06)
36. The UI never waits on Neon. Local writes come first. **Offline is a neutral indicator**, not an error, and only network-only actions are disabled.
37. State lives in **indicators** (the dot plus text in the panel and dashboard header). Toasts only confirm a user action.
38. Toasts: one at a time, one sentence plus at most one action, 6 s, paused on hover or focus, Undo for 10 s, `aria-live="polite"`.
39. "Database unreachable": retry with backoff, then escalate to a card after the 3rd failure or 5 minutes. The card reads "Your data is safe on this device. [Retry] [Details]". Never a modal.
40. Conflicts: settle automatically per field (last writer wins, tags union). Only true same-field conflicts reach the user, with a side-by-side choice that can be reversed for 30 days.
41. Migrations run in the background worker before the tool mounts:
    - An automatic backup is taken first.
    - Percent-done shows if the migration takes over 10 s, and only that tool is blocked.
    - A failure rolls back and keeps working on the old version.
    - The dashboard shows "Database up to date · vN".
42. **Undo over confirm.** Soft-delete everything with "Recently deleted" (30 days). Ask for confirmation only for wipes, remote deletion and restore-over. The confirm button names the action ("Delete 1,284 chats"). A full wipe requires typing the tool name.
43. Timing:
    - Local data shows on the first frame.
    - Skeleton only for network panes, after 300 ms.
    - Spinner only after 1 s.
    - Over 10 s, percent-done plus Cancel.

### Premium feel (07)
44. Motion budget:
    - 80 to 120 ms feedback
    - 150 ms tab change
    - 160 / 120 ms popover in/out
    - 200 / 150 ms toast
    - 700 ms "changed" flash

    No springs, no loops, no staggered list entrances. Reduce-motion turns off everything except opacity fades of 100 ms or less.
45. Type:
    - Schibsted Grotesk in 3 weights for UI, Source Serif 4 only for reading chats, monospace only for code and `<kbd>`.
    - 5 sizes (12/13/14/16/20).
    - Tabular numbers everywhere.
    - Sentence case.
46. Colour: one accent, used for the primary button, focus, selection and progress. Themes come from base + accent + contrast in OKLCH, so dark and high-contrast come for free. Modules use only tokens (enforced by lint).
47. Layout: 4 px grid, 40 / 32 px rows, 16 px icons, hairline borders instead of shadows (shadows only on floating layers), nested radius = outer − padding, all left edges aligned.
48. Never ship:
    - Gradients or glass
    - Sparkle or emoji icons
    - Icon-in-circle feature-card grids
    - Centred hero text in the panel
    - Confetti or shimmer on local data
    - "OK" buttons
    - "Supercharge / seamlessly" copy
    - Removed focus rings
    - Mixed icon sets
    - Modals that could be inline
49. Before merging each screen: check 360 / 600 px × light / dark × comfortable / compact, a full keyboard run-through, token-only styles, and verb-first copy.

## To verify by hand (not confirmed from primary sources)
- The current side-panel minimum width (360 px per Chrome DevRel in 2024; 320 px in some 2026 reports).
- Whether Ctrl+K inside an extension side panel reaches the page or is taken by Chrome.
- The claude.ai and chatgpt.com shortcut lists. Neither company publishes one; check each site's shortcut dialog.
- Whether `sidePanel` opening grants `activeTab`.

## Files
- `01-side-panel.md`
- `02-command-palette.md`
- `03-settings-at-scale.md`
- `04-onboarding-permissions-privacy.md`
- `05-in-page-ui.md`
- `06-feedback-sync-errors.md`
- `07-premium-feel.md`
