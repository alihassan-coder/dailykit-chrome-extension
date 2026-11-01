# 02: Turning modules on and off at runtime (MV3, Chrome + Firefox)

Researched 2026-10-31.

## The API: `chrome.scripting.registerContentScripts`

Source: https://developer.chrome.com/docs/extensions/reference/api/scripting

- Methods `registerContentScripts`, `getRegisteredContentScripts`, `updateContentScripts` and `unregisterContentScripts` need **Chrome 96+**.
- `RegisteredContentScript` fields: `id` (cannot start with `_`), `matches` (required), `excludeMatches`, `js`, `css`, `allFrames`, `matchOriginAsFallback` (Chrome 119+), `runAt`, `persistAcrossSessions`, `world`.
- `world: 'MAIN' | 'ISOLATED'` on a registered script needs **Chrome 102+**.
- Registration is **atomic**: if one script has a bad file or a duplicate id, *none* are registered.
- `unregisterContentScripts()` with no filter removes **all** dynamic scripts. It does not remove scripts already injected into open pages.
- Permissions: `"scripting"` plus host permission for the target origins.
- When a script runs in the MAIN world, the **page's CSP applies** (https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).

Browser compatibility (MDN browser-compat-data, `webextensions/api/scripting.json`, fetched 2026-10-31):

| Feature | Chrome | Firefox |
| --- | --- | --- |
| `registerContentScripts` | 96 | 102 |
| `RegisteredContentScript.world` | 102 | **128** |
| `ExecutionWorld.MAIN` | 102 | **128** |
| `persistAcrossSessions` | 96 | 102 (before 105 it was required and had to be `false`; from 105 any boolean is accepted) |
| `matchOriginAsFallback` | 119 | 128 |
| `optional_host_permissions` (manifest) | 102 | **128** |

Cairn already requires Firefox 142+ and Chrome 111+, so every feature above is available on both browsers.

Persistence: `persistAcrossSessions` defaults to `true`. MDN warns: "When an extension updates, content scripts are cleared. To restore scripts, add code to `runtime.onInstalled` … `update`" (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/scripting/RegisteredContentScript). A WXT issue author claims they *persist across updates* on Chrome (https://github.com/wxt-dev/wxt/issues/2239). **Treat this as unreliable on both browsers.** Run an idempotent reconcile on `onInstalled` and `onStartup`.

## Permission model per module

- Bundle build:
  - `permissions: ["scripting", "storage", ...]`.
  - Every site a module needs goes in **`optional_host_permissions`**.
  - When the user enables a module on the dashboard, call `chrome.permissions.request({ origins })`. The call must run inside the click handler (user gesture), from an extension page.
  - On disable, call `chrome.permissions.remove`.
  - Listen to `permissions.onRemoved`, because the user can revoke access from browser UI at any time.
- Standalone build: the same module declares its hosts in `host_permissions`/`content_scripts` statically (one product, one purpose, and the install prompt shows it).
- Benefit: adding a new module to the bundle in an update does **not** trigger Chrome's "permissions increased, extension disabled" escalation, because optional hosts are not escalations. This is the exact motivation of WXT issue #2239.
- Firefox: MV3 host permissions are user-controllable in about:addons. From Firefox 127, `host_permissions` and `content_scripts` hosts are shown in the install prompt, but **new hosts added in an update are not shown** (bug 1893232) (https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/host_permissions). Always check `permissions.contains()` and never assume access was granted.

## Reconcile loop (pattern, not code)

The background script keeps one function, `reconcile()`:

```
desired = for each module in settings.enabled
            where permissions.contains({origins: module.hostMatches})
          -> module.contentScripts (ids prefixed "dk:<moduleId>:")
current = getRegisteredContentScripts() filtered to ids starting "dk:"
unregister(current - desired); register(desired - current); update(changed)
```

Triggers: `runtime.onInstalled` (all reasons), `runtime.onStartup`, `permissions.onAdded`/`onRemoved`, and `storage.onChanged` for the enabled-modules key.

- **Never call `unregisterContentScripts()` without an id filter.** WXT registers its own content scripts dynamically in dev mode for hot reload (https://wxt.dev/guide/resources/faq.html), and an unfiltered call would remove them.
- Open tabs: a newly registered script runs only on the next navigation. Cairn's MAIN-world fetch wrapper must run at `document_start` before the site's code, so it **cannot be retrofitted with `executeScript`**. After enabling, show a "reload claude.ai to activate" toast or offer a reload button that calls `tabs.reload`.
- Disabling: already-injected scripts keep running until reload. Each module's content entry should also check a "module enabled" flag (storage) and tear down its UI live, using `ctx.onInvalidated` and its own disposer.

## Cairn mapped onto this

Cairn's manifest has two pairs, one per site:

1. MAIN world, `document_start`: `injected/core.js` then `sites/<site>/bridge.js`.
2. ISOLATED world: the content bundle.

As registered scripts this becomes:

- `dk:cairn:claude-main`: `{ js: ['content-scripts/cairn-claude-main.js'], world: 'MAIN', runAt: 'document_start', matches: ['https://claude.ai/*'] }`. Bundle `core.js` and the bridge into **one** file, so load order is fixed by the bundler, not by array order.
- `dk:cairn:claude-isolated`: `{ js: [...], css: [...], runAt: 'document_idle' }`. If the MessagePort handshake needs the isolated side earlier, use `document_start`.
- The same two scripts again for chatgpt.com / chat.openai.com.

Cairn's private-MessagePort handshake (page scripts cannot forge events) still works unchanged, because both worlds are injected into the same document.

## How WXT supports this (0.21.5)

- `defineContentScript({ registration: 'runtime', ... })`: "you are responsible for using the scripting API to register/execute the content script dynamically at runtime" (https://wxt.dev/api/reference/wxt/interfaces/BaseContentScriptEntrypointOptions.html). WXT still bundles the file to `content-scripts/<name>.js` (plus `.css`). It **adds the script's `matches` to `host_permissions`** (JSDoc per commit e47519f, https://github.com/wxt-dev/wxt/commit/e47519f), which is the opposite of what the bundle wants.
- `registration: 'optional'` (puts matches in `optional_host_permissions`) is **open** issue #2239, milestone v1.1, with PR #2288 open. Until it ships, use a `build:manifestGenerated` hook in your own WXT module that moves those hosts from `host_permissions` to `optional_host_permissions`. A team commenting on the issue already does this with a custom module.
- There is no typed way to get a runtime-registered script's built path. This is issue #2040, open; the maintainer recommends generating a module under `.wxt/` from the `entrypoints:resolved` hook (see 01, `wxt-kit`).
- `world: 'MAIN'` is supported on `defineContentScript`. The WXT docs prefer `injectScript()` for MV2 compatibility (https://wxt.dev/guide/essentials/content-scripts.html). For Cairn, keep the true MAIN-world registration: `injectScript` inserts a `<script>` element *after* the isolated script starts, which is not guaranteed to run before the page's first fetch, and the page's CSP can block it.
- `cssInjectionMode: 'ui'` (CSS goes to the shadow root, see 03) means you do not list CSS in the registration.

## Firefox parity notes

- WXT emits `background.scripts` (an event page) for Firefox, not a service worker. Lifetimes are similar (idle unload), but a DOM is available. Cairn's manifest already lists both `service_worker` and `scripts`.
- In Firefox, `runAt` also decides **when registered CSS is inserted**. Chrome inserts CSS at the start regardless (MDN, above). This is irrelevant if CSS lives in a shadow root.
- `chrome.*` is available in Firefox. WXT's `browser` import normalises the namespace, and Chrome 148+ also exposes `browser.*` natively (scripting API page note).

## Recommendation

In the bundle, declare all module hosts as `optional_host_permissions` and register module content scripts at runtime with `registerContentScripts` (MAIN + ISOLATED, `document_start` where needed, id prefix `dk:<module>:`), driven by one idempotent `reconcile()` in the background. Standalone builds of the same module use static manifest registration. Use WXT's `registration: 'runtime'` plus your own manifest hook until `registration: 'optional'` ships.
