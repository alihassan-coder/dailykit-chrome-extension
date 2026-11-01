# 04 · Onboarding, permissions, privacy and trust

Question: first-run for a multi-tool extension, asking for site permissions when they are needed, explaining local vs synced data clearly, and trust signals for a paid product.

Researched 2026-10-31.

## TL;DR

- **Store policy risk first.** Chrome Web Store requires "a single purpose that is narrow and easy to understand" and says "Broad, multi-purpose toolbars are not allowed." A store listing for the DailyKit bundle must be framed around one narrow purpose. Selling tools separately, as planned, is the policy's own recommendation. Treat the bundle as a candidate for private/unlisted distribution, or define its purpose narrowly (for example "tools for working with AI chat sites").
- Ask for host access **at the moment a tool first needs it**, using `optional_host_permissions` and `permissions.request()` inside a click. A new required permission in an update **disables the extension** until the user accepts it.
- Skip the product tour. NN/g finds tutorials get skipped and forgotten, and contextual "pull" help works better. First run should be one screen plus contextual tips.
- Say where data lives in one sentence per tool, every time it matters: "On this device" or "Synced to your database". Use the words, not only an icon.

## Findings

### Store policy
- "An extension must have a single purpose that is narrow and easy to understand." "Don't create an extension that requires users to accept bundles of unrelated functionality." "If two pieces of functionality are clearly separate, they should be put into two different extensions." [Quality guidelines](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines)
- A single purpose may be a "focus area or subject matter" or a "browser function". "Broad, multi-purpose toolbars are not allowed." Toolbars that "inject UI into every page are not recommended". [Quality guidelines FAQ](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq)
- The side panel also falls under single purpose. [Side panel launch post](https://developer.chrome.com/blog/extension-side-panel-launch)
- Disclosure: "Prominently disclose what user data will be collected and how it will be used", get "affirmative and informed consent", and disclose changes to data practices after install. [Disclosure requirements](https://developer.chrome.com/docs/webstore/program-policies/disclosure-requirements)
- Limited Use: data use is limited to the disclosed single purpose, with no transfer to ad platforms or brokers and no human reading except narrow exceptions. A public compliance statement is required. [Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- No hidden features: "Don't misrepresent the functionality of your product or include non-obvious functionality." [Misleading behavior](https://developer.chrome.com/docs/webstore/program-policies/unexpected-behavior)

### Permission mechanics
- Optional permissions are requested "at runtime", which gives context for each one and lets users choose features. A new warning-triggering permission in an update means the extension "will be disabled until the user accepts". [Permission warnings](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings)
- `request()` must run "from inside a user gesture". Most permissions can be optional. `remove()` gives access back, and a later `request()` usually restores it without a prompt. `contains()`, `onAdded` and `onRemoved` exist. [permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- `activeTab` shows **no install warning** and grants temporary access when the user invokes the extension. [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- Users can limit site access to *on click*, *on specific sites* or *on all sites*, from chrome://extensions or the toolbar menu. The extension must cope with access being withdrawn. [User controls for host permissions](https://developer.chrome.com/docs/extensions/mv2/runtime-host-permissions) (MV2-era guide, but the controls still ship.)

### Onboarding research
- Tutorials are "frequently skipped", "don't tend to be memorable", and "don't result in better task performance". Contextual "pull revelations" work better. A walkthrough is justified only for a new interaction model, and should stay re-openable. [NN/g Onboarding tutorials](https://www.nngroup.com/articles/onboarding-tutorials/)
- Chrome recommends teaching side-panel use inside the extension and with a store-listing video. [Side panel launch post](https://developer.chrome.com/blog/extension-side-panel-launch)
- Cairn already has an in-product **Guide** tab, which is a good pull-style model to keep.

### Local-first trust
- Ink & Switch: "No spinners", "The network is optional", "You retain ultimate ownership and control". **Make clear whether data is stored only on the device or sent to a backend.** [Local-first software](https://www.inkandswitch.com/essay/local-first/)

## Recommendations for DailyKit

### First run (one screen, under 30 seconds)

1. On install, open the **dashboard** in a tab with a welcome card (not a carousel). It contains:
   - One sentence: "DailyKit keeps your tools in the side panel. Everything is stored on this device unless you turn on sync."
   - **Pin the toolbar icon**, shown as a picture of Chrome's puzzle menu. Extensions can't pin themselves.
   - **Open the side panel** (button, so it counts as a user gesture and `sidePanel.open()` works).
   - **Choose your tools**: the tool list with switches. Only tools with no site access needed are on by default. Cairn starts *on but waiting for access* (see 3).
   - The palette shortcut, shown as `<kbd>`, with "Change" linking to `chrome://extensions/shortcuts`.
2. No tour. Each tool shows its own **first-use tip, once**, in context. For example, the first time a user opens a Claude incognito chat: "Save chat keeps this conversation on your device." It can be dismissed and comes back via the tool's Guide tab.
3. **Site access at the moment of need.** Cairn's sites go in `optional_host_permissions`. The first time the user opens Cairn in the panel, or visits claude.ai, the panel shows a card: "Cairn needs to read claude.ai and chatgpt.com to save chats. It never sends them anywhere. [Allow on these 2 sites]". The button calls `permissions.request()`. If declined, the tool stays visible with the card. Don't nag: the card shows again only when the user opens the tool.
4. Listen to `permissions.onRemoved`. If the user revokes access in Chrome, the tool shows "Access to claude.ai was removed in Chrome settings. [Allow again]", not a broken UI.
5. **Never add a required host permission in an update.** New tools ship with optional permissions only, so updates never disable the extension.

### Privacy language

6. A **data-location label** sits on every list header and item where it is true, for example "This device" or "Synced", as in the blueprint's chips. It always uses words, never only a cloud icon.
7. **Data & sync page**, top line: "Stored on this device: 1,284 items, 18 MB. Synced: off." When sync is on: "Synced to your Neon database ab12…cd. Only the background worker holds the connection string."
8. **Turning on sync is a prominent disclosure moment** (policy). It is a full-width card listing *which tools* and *which data* will leave the device, a per-tool checkbox list (default: none checked), and the button "Start syncing Cairn". Never "OK".
9. Say what is *not* protected, as Cairn already does: "The passcode lock hides the library; saved chats are not encrypted." Honest limits build more trust than vague claims.

### Trust signals for a paid product

10. A **visible version and changelog** link in the dashboard footer and on each tool row (the blueprint already shows `0.13.0`).
11. A **permissions-explained page** listing each permission → which tool needs it → why → whether it is optional. The same text goes into the store listing and privacy policy, including the Limited Use statement.
12. **Export is never paywalled**, and is always one click: a full backup in an open format (JSON plus Markdown). This is the "ultimate ownership" ideal.
13. The licence/purchase state is calm and factual ("Cairn · Licensed to …"), with no countdown banners. Upgrade prompts appear only at the point where a locked feature is used.
14. No remote code and no analytics, as Cairn states today. Say so in the About page in one line.

## Open questions
- The bundle's store strategy (listed vs unlisted, and its purpose statement) is a product decision. Flag it to the owner before naming features in the bundle's listing.
