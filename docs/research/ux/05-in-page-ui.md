# 05 · In-page UI etiquette

Question: how to put floating buttons and docks on third-party pages (claude.ai, chatgpt.com) without annoying users or breaking the sites, and how dismiss or hide-per-site should work.

Researched 2026-10-31.

## TL;DR

- Chrome's own policy FAQ says toolbars that "inject UI into every page are not recommended" and suggests the popup instead. DailyKit already has a side panel, so **in-page UI should be the exception**. Each piece must be tied to a page *state*, such as "this is a private chat", not just to the site.
- Render all in-page UI inside a **Shadow DOM** (WXT `createShadowRootUi`), so neither side's CSS leaks into the other. Use an **iframe** when the UI shows user data that the host page must not be able to read.
- Every in-page element must be dismissable in three ways: **hide now**, **hide on this site** (kept until undone), and a global switch in the dashboard. 1Password users complain loudly because "Hide on this page" only lasts until restart.

## Findings

- Policy: toolbars that "inject UI into every page are not recommended" because they slow page loads and clutter the UI; "consider using an action popup". "Broad, multi-purpose toolbars are not allowed." [Quality guidelines FAQ](https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines-faq)
- Isolation options in WXT ([Content script UI](https://wxt.dev/guide/essentials/content-scripts)):
  - Integrated: no isolation.
  - Shadow root: isolated styles, events isolation optional. Note: **`rem` still follows the host's `<html>` font size**.
  - IFrame: full style and event isolation, but the page must be in `web_accessible_resources`.
  - `anchor` + `autoMount()` mounts and unmounts with a host element. SPAs need `wxt:locationchange` handling.
- 1Password's "Hide on this page" "only works until you restart your browser". Users keep asking for a lasting "hide on this site". [1Password community](https://www.1password.community/1password-at-home-31/feature-request-hide-1password-on-an-entire-website-14339/index4.html), [another thread](https://1password.community/discussion/comment/682084)
- Grammarly's model: turn it off per site from the toolbar menu, or per field from the in-field button ("for the next visit" or "forever"). [Grammarly support](https://support.grammarly.com/hc/en-us/articles/115000091612-Turn-off-Grammarly-on-one-or-more-websites), [per text field](https://support.grammarly.com/hc/en-us/articles/115000091572-Turn-off-Grammarly-in-a-text-field)
- Cairn today: a round dock at bottom right on both sites, a **Save chat** chip shown only in private chats, a Quote button on text selection, usage bars in Claude's header, a banner on new normal chats, and snippet expansion in the composer (`/home/ali-hassan/Downloads/extantion/cairn/README.md`).

## Recommendations for DailyKit

### What may appear in a page

1. **Default to nothing.** In-page UI appears only when the page is in a state the tool cares about. For Cairn:
   - A private chat shows the Save chip.
   - A text selection shows the Quote button.
   - Typing `{{` in the composer activates the snippet fill.
   - A normal chat on a shared account shows the banner, and only if that feature is on.
2. **Replace the always-on round dock** with the side panel. The toolbar icon and `Alt+Shift+D` open the panel, which can show everything the dock panel showed (Now / Insert / Saved). If a dock stays, it is **off by default**, available as the dashboard feature "Show Cairn button on the page". This removes the "inject UI into every page" pattern the store discourages.
3. **One in-page element per tool at a time**, at most one floating element per page across all tools. The shell owns a single **in-page slot**, and tools ask the shell for it instead of each mounting its own corner button.
4. **Attach to the host UI, don't float over it.** Put the Save chip next to the site's own header controls, using `anchor` + `autoMount`. Only fall back to a fixed corner position when the anchor is missing, and then use bottom-right with a 16 px inset, never covering the composer or the send button.
5. **Never take over host behaviour silently.** Snippet expansion already shows the text before sending, and a second Enter is needed. Keep that rule: nothing is sent on the user's behalf.

### Technical etiquette

6. **Shadow root for every element.** Set `font-size` in px or define the type scale on `:host`, because `rem` follows the host page. Set `all: initial` on the host. Use the highest `z-index` only for the open state, and a modest one at rest.
7. **Use an iframe** for anything that shows saved content (a library preview) or takes a passcode, so host-page scripts can't read it.
8. **Stay fast:** mount after `document_idle`, except the page-world bridge Cairn needs at `document_start`. Use no layout-shifting inserts, and don't run a MutationObserver over the whole document without a throttle.
9. **SPA-safe:** remount on location change, and unmount everything when the URL leaves the tool's match patterns.
10. **Respect the theme.** Read the host's `color-scheme` or background brightness and use DailyKit's dark or light tokens to match. A pale chip on ChatGPT's dark UI looks like an ad.

### Dismiss and hide-per-site

11. Every element has a `⋯` with: **Hide for now** (until the next page load) · **Don't show on this site** · **Settings…**. Right-click on the toolbar icon also offers "Hide DailyKit on this site".
12. "Don't show on this site" **is kept** (stored per tool and origin) until undone, and shows a toast: "Cairn's Save chip hidden on claude.ai. [Undo]". It is listed in the dashboard under the tool's *Sites* section with "Show again".
13. **Panic hide** (`Alt+Shift+H`, see 02) blurs the page and hides *all* DailyKit in-page UI immediately, with no animation longer than 100 ms.
14. In-page UI never shows its own onboarding coach marks more than once per tool. The tip text lives in the side panel's Guide.
