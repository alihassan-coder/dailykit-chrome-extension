# 03: React + Tailwind v4 UI inside third-party pages

Researched 2026-10-31. Versions: WXT 0.21.5, tailwindcss / @tailwindcss/vite 4.3.3 (docs header v4.3), React 19.3.1, radix-ui 1.8.1, @base-ui/react 1.9.0.

## Mounting: WXT `createShadowRootUi`

Source: https://wxt.dev/guide/essentials/content-scripts.html, options: https://wxt.dev/api/reference/wxt/utils/content-script-ui/shadow-root/interfaces/shadowrootcontentscriptuioptions

- In the content script, set `cssInjectionMode: 'ui'` and `import './style.css'`. WXT then puts the compiled CSS into the shadow root instead of the page.
- Options:
  - `name`: kebab-case host tag. Use a unique one, such as `dailykit-cairn`.
  - `mode`: `'open'` (the default) or `'closed'`.
  - `position`: `'inline' | 'overlay' | 'modal'`.
  - `anchor`, `append`, `zIndex`.
  - `css`: extra CSS text.
  - `isolateEvents`: `true` stops key events bubbling out of the shadow root, or pass a list of event names.
  - `inheritStyles`: default `false`, meaning WXT adds `all: initial` before your CSS.
  - `onMount(container, shadow, host)` and `onRemove`.
- React: `onMount` → `createRoot(container).render(<App/>)`; `onRemove` → `root.unmount()`.
- Alternatives:
  - `createIntegratedUi`: no style isolation.
  - `createIframeUi`: full isolation, an extension page in an iframe, needs `web_accessible_resources`, and supports HMR. Use the iframe for heavy panels when shadow-root friction gets too high. Cairn's library is already an extension page.
- SPA sites (claude.ai, chatgpt.com) do not reload on navigation. Use `ctx.addEventListener(window, 'wxt:locationchange', ...)`, and the `ctx.setTimeout`/`setInterval` helpers so everything stops when the context is invalidated (after extension reload or update).
- Set `isolateEvents: ['keydown','keyup','keypress']` for any UI with text inputs. Chat sites bind global shortcuts (`/` to focus, Enter handlers) that would otherwise react to typing in your panel.

## Tailwind v4 problems inside a shadow root, and fixes

### 1. `rem` units scale with the host page
- `rem` is resolved against `<html>` outside the shadow root. WXT's `all: initial` resets everything except rem (WXT docs above).
- WXT FAQ fix: convert rem to px at build time with `postcss-rem-to-responsive-pixel` (https://wxt.dev/guide/resources/faq.html).
- A better fit for DailyKit: Tailwind v4 drives the whole spacing scale from **one** variable, `--spacing` (https://tailwindcss.com/docs/theme). Define `--spacing: calc(4px * var(--dk-density))`, and define `--text-*` and `--radius-*` in px multiplied by a scale var. That removes rem from the token layer *and* gives user-controlled density for free (see 04). Still run the PostCSS rem→px pass as a safety net for any remaining defaults.

### 2. `@property` does not work inside shadow roots
- Tailwind v4 uses `@property` to register `--tw-*` (shadow, ring, gradient, transform internals). The spec ignores `@property` in shadow trees, so without a fix, `shadow-*`, `ring-*`, borders and gradients silently break. Tracking: tailwindlabs/tailwindcss#15005 (open per tracker), discussion #19371.
- **WXT already works around this.** `splitShadowRootCss` (WXT PR #1594) moves the `@property` rules into the host page's `<head>`.
- That workaround causes a **new bug**: the extension's typed `@property --tw-gradient-from { syntax: '<color>' }` breaks **host pages that use Tailwind v3** (broken gradients, "Invalid property value"). WXT issue #1955 is open.
- The fix PR #2005 (`cssPropertyRename`, `--tw-` → custom prefix) has been **open since 2025-12** with changes requested, and was still active on 2026-10-25.
- Workaround today: a PostCSS plugin that renames `--tw-` to `--dk-tw-` in `@property`, declarations and `var()` (as done in the read-frog project, referenced in #1955).
- Uncertain: whether Tailwind's `prefix(dk)` option also renames the internal `--tw-*` properties. The docs say only that it prefixes classes and **theme** variables (`--color-red-500` → `--tw-color-red-500` with `prefix(tw)`) (https://tailwindcss.com/docs/styling-with-utility-classes). Verify in a spike before relying on it.
- Sources: https://github.com/wxt-dev/wxt/issues/1955, https://github.com/wxt-dev/wxt/pull/2005, https://github.com/tailwindlabs/tailwindcss/discussions/19371

### 3. Theme variables need `:host`
- Fixed upstream. Tailwind PR #15975 (merged 2025-01-29) emits `@theme` variables on `:root, :host`, so they resolve inside shadow roots (https://github.com/tailwindlabs/tailwindcss/pull/15975).
- Your **own** semantic tokens must also be declared on `:host` (or on the container element), not only on `:root`.

### 4. Dark mode / theme switching
- Do not key off the host page's `<html class="dark">`.
- Define `@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));` (https://tailwindcss.com/docs/dark-mode) and set `data-theme` on your own container inside the shadow root.

### 5. Fonts
- `@font-face` declared inside a shadow root is not usable there. This is long-standing Chromium/Firefox behaviour (Mozilla bug 1077396, https://bugzilla.mozilla.org/show_bug.cgi?id=1077396). The sources are old, so verify on current Chrome.
- Fix: register fonts on the document with the `FontFace` API (`document.fonts.add(new FontFace('DK Sans', 'url(' + browser.runtime.getURL('/fonts/x.woff2') + ')'))`) and list the font files in `web_accessible_resources`.
- Name font families uniquely (`DK Sans`) so you never pick up or override the page's fonts.

### 6. Host-page collisions that remain
- Page CSS cannot select inside your shadow root. It can still style your **host element** (`body > *`, `div` resets, `[class]` selectors).
- WXT positions the host for you. Keep the host tag custom and unique.
- Inherited properties are reset by `all: initial`. Leave `inheritStyles` false.
- z-index wars: prefer the browser **top layer** (`<dialog>`/`showModal()` or the `popover` attribute) for overlays, so the page's `z-index: 2147483647` elements do not cover you. Otherwise use WXT `zIndex` with `position: 'overlay'`.

## shadcn/ui, Radix and Base UI portals

- Radix `Portal` appends to `document.body` by default and accepts `container: HTMLElement` (https://www.radix-ui.com/primitives/docs/utilities/portal). Content portalled to `body` lands **outside** the shadow root, where it is unstyled, and it breaks dismiss and focus logic.
- Pattern:
  - Create a `PortalContainerContext` whose value is a `<div>` inside the shadow root, created in `onMount`.
  - In every shadcn wrapper that renders a `*Portal` (Dialog, Popover, DropdownMenu, Select, Tooltip, HoverCard, ContextMenu, Sheet, Toast/Sonner), pass `container={useContext(PortalContainerContext)}`. shadcn copies the source into your repo, so edit the generated components once.
- Base UI (`@base-ui/react` 1.9.0) is an alternative primitive set that the shadcn CLI also supports. Its portals likewise take a container (uncertain: I did not find Base UI shadow-DOM docs).
- Outside-click and focus: inside a shadow root, events seen at `document` level are retargeted to the host element. Radix `DismissableLayer` has had extension-related outside-click bugs (radix-ui/primitives#2055), and newer versions have `deferPointerDownOutside` (seen in @radix-ui/react-dismissable-layer 1.1.19 diff, unverified). **Test Dialog, Popover and Select inside the shadow root early.** This is the most likely source of "random" bugs.
- Toasts (Sonner) inject their own `<style>` into `document.head` (uncertain, check your version). If so, the styles will not reach the shadow root. Prefer a small in-house toast built from your tokens, or pass the styles in.

## Recommended setup

1. One shared `packages/ui/src/styles/ui.css`. Every content-script UI imports it with `cssInjectionMode: 'ui'`. Extension pages (dashboard, library, popup) import the same file normally.
2. Tokens:
   - `@import "tailwindcss" source(none)` plus `@source` the packages.
   - `@theme { --*: initial; ... }` to drop default palettes (see 04).
   - px-based `--spacing`, with sizes multiplied by density and scale vars.
3. A build-time PostCSS step: rem→px, then rename `--tw-` → `--dk-tw-`. Remove the rename when WXT ships `cssPropertyRename` (#2005).
4. `ShadowRootProvider` in `packages/ui`. It provides the portal container, sets `data-theme`, applies the user's token overrides to the container's `style`, and registers fonts once per document.
5. Use shadcn components as source (owned code), patched for portal containers, and styled exclusively with your semantic tokens.
