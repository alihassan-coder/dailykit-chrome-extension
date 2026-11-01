# 02 · Reading pages and acting on them in MV3

Question: how to build a compact page representation a model can use, how to take screenshots, how to click and type reliably, how to handle iframes and shadow DOM, and how to keep element references stable, on Chrome and Firefox in MV3.

Researched 2026-11-01. Facts marked **(unverified)** were not confirmed against a primary source today.

## TL;DR

- Use a **two-tier design**. Tier A is a **content-script DOM walker** that works on Chrome and Firefox with no infobar. Tier B is an optional **CDP (`chrome.debugger`) backend**, Chrome only, for trusted input events, out-of-process iframes and closed shadow roots.
- Output an Anthropic-style **accessibility-ish text tree with `ref_N` IDs** (role, name, key attributes, interactive only by default, about 50k character cap). Anthropic's `browser_toolset_20260801` uses this format, and so do Claude in Chrome, browser-use and nanobrowser.
- Keep refs stable with a **per-tab `ref → WeakRef<Element>` map** that is never renumbered. Store a fingerprint (role, name, nth, frame) with each ref and revalidate before every action. Return a "stale ref, re-read the page" error instead of guessing.
- Screenshots: `tabs.captureVisibleTab` works on both browsers and needs no debugger. It is limited to **2 calls per second** and captures the visible viewport of the active tab only. Downscale to about 1280×800 and map coordinates back.
- Clicks: content-script synthetic events have `isTrusted === false`. Many sites ignore them. Use `element.click()` / `focus()` plus value setters plus `input`/`change` events for forms, and use CDP `Input.dispatchMouseEvent` / `Input.insertText` when trust matters.

## Findings

### Option 1: CDP accessibility tree (`chrome.debugger`)

| Fact | Source |
|---|---|
| Needs the `"debugger"` permission. Available domains include Accessibility, DOM, DOMSnapshot, Input, Page, Runtime, Target, Network and Overlay. Not every CDP domain is exposed. | [chrome.debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger) (updated 2026-10-29) |
| `Accessibility.getFullAXTree(depth?, frameId?)`, `getPartialAXTree`, `queryAXTree(accessibleName, role)`. **The whole Accessibility domain is marked experimental.** | [CDP protocol JSON](https://github.com/ChromeDevTools/devtools-protocol/blob/master/json/browser_protocol.json), [Accessibility domain](https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/) |
| AX nodes carry `backendDOMNodeId`, which you resolve with `DOM.resolveNode` / `DOM.getBoxModel` / `DOM.scrollIntoViewIfNeeded`. | same |
| Out-of-process iframes: flat sessions are supported from **Chrome 125**. Use `Target.setAutoAttach({flatten:true})`, then send commands with a `sessionId`. Auto-attach is **not recursive**, so call it at each level. | [chrome.debugger](https://developer.chrome.com/docs/extensions/reference/api/debugger) |
| `onDetach` reasons are `target_closed` and `canceled_by_user`. Opening DevTools on the tab also detaches. | same |
| **Infobar:** while attached, Chrome shows "<Extension> started debugging this browser" on all tabs. Extensions cannot hide it. The workarounds are the `--silent-debugger-extension-api` launch flag or enterprise force-install. Claude in Chrome users complain about it (June 2026 issue). | [claudeissues #69287](https://claudeissues.com/issue/69287-claude-in-chrome-started-debugging-this-browser-banner-shows-on-every-tab-please), [Dictanote help](https://help.dictanote.co/help/general/hiding-the-voice-in-started-debugging-this-browser-message). Secondary sources; Chrome's docs say nothing about it. |
| **Firefox has no `debugger` API.** Bugzilla 1316741 is open at P3, and Mozilla DevTools has said there are no plans. | [bug 1316741](https://bugzilla.mozilla.org/show_bug.cgi?id=1316741), [Mozilla discourse](https://discourse.mozilla.org/t/does-mozilla-plan-to-support-chrome-debugger-protocol-in-webextension-api/14311) |

Pros: Chrome computes the real accessible names and roles. It sees closed shadow roots and cross-origin iframes. Input events are trusted. Cons: Chrome only, an infobar, a scarier install warning ("Read and change all your data... / access the page debugger backend"), the attach is lost when DevTools opens, the domain is experimental, and the raw tree is huge (filter it hard).

### Option 2: DOM walk in a content script (both browsers)

Inject on demand with `chrome.scripting.executeScript({target:{tabId, allFrames:true}, func})`. Toolbelt already has `<all_urls>` and the `scripting` permission. Claude in Chrome does exactly this for `read_page`: it injects `__generateAccessibilityTree` and keeps refs in a `WeakRef` map ([gist](https://gist.github.com/sshh12/e352c053627ccbe1636781f73d6d715b), unverified).

The walker should:

1. Walk `document.body`. Descend into **open** shadow roots (`el.shadowRoot`) and **closed** ones through `chrome.dom.openOrClosedShadowRoot(el)` (Chrome 88+, [chrome.dom](https://developer.chrome.com/docs/extensions/reference/api/dom)) or Firefox's `element.openOrClosedShadowRoot()` ([MDN](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/dom/openOrClosedShadowRoot), unverified today).
2. Compute a role (explicit `role`, else implicit from tag and type) and an accessible name (`aria-labelledby` > `aria-label` > `<label for>` / wrapping label > `alt`/`title`/`placeholder` > text content, trimmed to about 80 characters). This is a simplification of the W3C accname algorithm. Good enough, but not exact.
3. Keep: interactive elements (a[href], button, input, select, textarea, summary, `[contenteditable]`, `[role=button|link|tab|menuitem|checkbox|...]`, `[onclick]`, `tabindex>=0`, `cursor:pointer`), plus headings and landmarks for structure. Drop invisible nodes (`checkVisibility()`, zero rect, `aria-hidden`).
4. Emit one line per node: `  button "Search" [ref_12] type=submit`. For inputs, show the value (masked for `type=password` and `autocomplete=cc-*`/`one-time-code`). Mark `(offscreen)` for out-of-viewport nodes and add a "N more elements below" hint (browser-use does this). Mark elements that are **new since the last read** (browser-use's `*` prefix) so the model notices dialogs and dropdowns that just appeared.
5. Cap the output at about 50k characters (Anthropic's cap), and support `ref` subtree scoping and `filter: all|interactive`.

**Iframes:** with `allFrames:true` each frame runs its own walker. Use `webNavigation.getAllFrames` to map frameIds and prefix refs per frame (`f3:ref_7`), or keep one global counter in the service worker. Cross-origin iframes work in content scripts because host permissions cover them, which the in-page JS of the parent does not get. Sandboxed or `about:blank` frames need `matchAboutBlank` / `matchOriginAsFallback`. Anthropic's toolset says to fall back to **coordinates** for cross-origin iframes, canvas and video.

Pros: works the same on Chrome and Firefox, no infobar, no extra permission, fast. Cons: synthetic (untrusted) events, a hand-rolled role and name computation, and it misses canvas and some custom widgets.

### Keeping references stable

Rules from Anthropic's toolset docs ([browser use tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool)): refs are scoped per tab, stay valid until navigation or a material DOM change, **must never be renumbered**, and the executor must detect staleness and return `Error: ref_3 is stale or not found on the current page. Re-read the page to get fresh references.`

Patterns seen in the sources:

- **WeakRef map in the page** (Claude in Chrome): `Map<string, WeakRef<Element>>` plus a reverse `WeakMap<Element,string>`. The same element keeps its ref across reads. Lost on navigation, because the content script world is reset.
- **CDP identity** (nanobrowser `refs.ts`): key = `(tabId, sessionId, frameId, loaderId, backendNodeId)` plus a fingerprint `{role, name, nth, context digest}`. The ref is revalidated before use, and the stale reason is reported. A per-epoch prefix guarantees a label is never handed out twice.
- Combine them: on each action, resolve the ref, then check `isConnected`, that the fingerprint still matches, and that the element is visible and enabled. Otherwise return the stale error. The tool result should include the post-action URL/title and a short diff ("dialog appeared", "navigated to X") so the model can decide whether to re-read.

### Screenshots

| Fact | Source |
|---|---|
| `tabs.captureVisibleTab(windowId?, {format: 'jpeg'\|'png', quality})` needs `<all_urls>` or `activeTab`. It captures the **visible area of the active tab** in that window. | [chrome.tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs) (updated 2026-10-29) |
| `MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND = 2`. "Expensive", so do not call it often. | same |
| chrome:// pages, other extensions' pages and data: URLs can only be captured with `activeTab`. File URLs need file access. | same |
| CDP `Page.captureScreenshot(format, quality, clip, fromSurface, captureBeyondViewport, optimizeForSpeed)` can capture **beyond the viewport** (full page) without scrolling. | [CDP protocol JSON](https://github.com/ChromeDevTools/devtools-protocol/blob/master/json/browser_protocol.json) |
| Firefox has `tabs.captureVisibleTab` and also `tabs.captureTab(tabId)` for non-active tabs **(unverified today)**. | [MDN captureTab](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/captureTab) |
| Claude: the long edge must be ≤ 2,576 px and ≤ 4,784 visual tokens on Opus 4.7+. Oversized images are **rejected, not downscaled**. A stricter per-side limit applies past 20 images per request. Recommended web size is 1280×800 or 1366×768. | [Computer use tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) |

Practical rules:

- Screenshot only on demand (a `screenshot` tool) or after an action when the text tree is not enough.
- Downscale with `OffscreenCanvas` to a long edge of 1280–1568 px as JPEG at about 70% quality. Remember `devicePixelRatio`, since the capture is in device pixels and clicks are in CSS pixels.
- Keep only the last 1–3 screenshots in history.
- Hide Toolbelt's own in-page UI before capturing, as Claude in Chrome does.
- Full page without CDP means scroll, capture, stitch, at no more than 2 captures per second. Avoid it. Prefer text plus a viewport screenshot.

### Executing actions

| Method | Trusted? | Browsers | Notes |
|---|---|---|---|
| `el.click()`, `el.focus()`, `form.requestSubmit()` | no (`isTrusted:false`) | both | Fine for most links and buttons. Some sites (anti-bot, some React handlers listening to `pointerdown`) ignore it. |
| Dispatch a full `pointerdown → mousedown → pointerup → mouseup → click` sequence at the element center | no | both | Covers handlers on pointer and mouse events. |
| Set an input value | n/a | both | For React and Vue, call the **native setter**, `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v)`, then dispatch `input` and `change` with `{bubbles:true}`. For contenteditable, use `document.execCommand('insertText')` (deprecated but works) or a Selection plus `InputEvent`. |
| CDP `Input.dispatchMouseEvent(type, x, y, button, clickCount)` | **yes** | Chrome | Needs coordinates. Get them from `DOM.getBoxModel` / `getContentQuads` after `DOM.scrollIntoViewIfNeeded`. |
| CDP `Input.insertText(text)` (experimental), `Input.dispatchKeyEvent` | **yes** | Chrome | Best for rich editors and keyboard shortcuts. |
| CDP `DOM.setFileInputFiles` | n/a | Chrome | The only way to set files. Keep it disabled (Anthropic disables `file_upload` by default). |

Before each action, check that the element is connected, visible, enabled and not covered: run `document.elementFromPoint(center)` and confirm it is the target or a descendant (nanobrowser has `actionability.ts` / `preflight.ts` for this). Scroll it into view first. After the action, wait for settle: a `MutationObserver` quiet period of about 500 ms, or a `webNavigation.onCompleted` event, with a timeout.

Navigation: use `tabs.update(tabId,{url})`. Allow only `http:`/`https:` and parse with `new URL()`. Re-check the blocklist **after redirects** (`webNavigation.onCommitted`), as Anthropic's docs say.

### Permissions and install warnings

- Already present: `<all_urls>`, `scripting`, `tabs`, `sidePanel`, `storage`. Also needed: `webNavigation` (frames, settle detection). Optional: `debugger`. Request it as an **optional permission** at runtime (`permissions.request`) so the base install does not carry the debugger warning (Chrome only).
- Firefox: in MV3, host permissions are user-controllable, so check `permissions.contains` before acting **(unverified on current Firefox)**. The side panel maps to `sidebar_action` (see `docs/research/ux/01-side-panel.md`).

## Recommendation

Default to the content-script walker plus `captureVisibleTab` on both browsers. Add a Chrome-only "Precise mode (debugger)" toggle later, used for trusted input and cross-origin iframe trees. Implement the backends behind one interface (`readPage`, `find`, `click(target)`, `type(target,text)`, `screenshot()`), so the agent loop never knows which backend runs.

## Open questions

- How often real sites reject untrusted clicks. Measure this with Toolbelt's e2e suite on the top sites the user cares about.
- Firefox `openOrClosedShadowRoot` and `captureTab` behaviour should be confirmed against current MDN.
