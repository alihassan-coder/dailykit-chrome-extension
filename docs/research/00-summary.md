# DailyKit research summary

Researched 2026-10-31 from primary sources (official docs, GitHub issues and PRs, MDN browser-compat-data, npm registry). Details, citations and open questions are in each file.

Pinned versions at time of writing: wxt 0.21.5, tailwindcss 4.3.3, react 19.3.1, eslint-plugin-boundaries 7.4.0, dependency-cruiser 18.7.0, @neondatabase/serverless 1.2.0, @neon/neon-js 0.10.2, typescript 7.0.2, pnpm 12.16.1, turbo 2.11.10.

1. **Multi-extension builds** ([01](./01-wxt-multi-extension-builds.md)): use a pnpm workspace with one WXT app per sellable product (`apps/dailykit`, `apps/cairn`), one package per feature (`modules/cairn`), and shared `packages/{core,ui,db,wxt-kit}`. `wxt-kit` is your own WXT module. It turns plain-data module descriptors into entrypoints (`entrypoints:found`, or thin re-export files) and into a manifest per mode (`build:manifestGenerated`). Skip Turborepo until CI caching matters. `-c` + `filterEntrypoints` in one project is fine only for quick spikes.

2. **Dynamic on/off modules** ([02](./02-dynamic-modules-mv3.md)): the bundle declares module hosts as `optional_host_permissions` and registers content scripts at runtime with `scripting.registerContentScripts` (`world: 'MAIN'`, `runAt: 'document_start'`, id prefix `dk:<module>:`). One idempotent `reconcile()` runs on install, startup, permission changes and settings changes. Open tabs need a reload. Firefox parity needs Firefox 128+ (Cairn already needs 142). WXT `registration: 'runtime'` wrongly adds hosts to required `host_permissions` (`'optional'` is issue #2239, open), so move them with your own manifest hook. Standalone builds register statically.

3. **React + Tailwind v4 in shadow DOM** ([03](./03-react-tailwind-shadow-dom.md)): mount with `createShadowRootUi` + `cssInjectionMode: 'ui'` + `isolateEvents` for keys. Fix three things in the build:
   - rem → px (px-based `--spacing` and type tokens multiplied by density and scale vars).
   - Rename `--tw-` → `--dk-tw-`. WXT hoists `@property` into the page head, which breaks host pages that use Tailwind v3 (WXT #1955, fix PR #2005 still open).
   - Fonts registered on the document via `FontFace`.
   Pass a shadow-root portal container to every shadcn/Radix portal, and test Dialog, Popover and Select dismissal early.

4. **User theming** ([04](./04-user-theming.md)): users set a small `UserTheme` (mode, accent, neutral, contrast, radius, density, scale, fonts). A TS generator turns it into OKLCH semantic `--dk-*` vars with contrast clamping, applied live via `storage.onChanged` on the page root or shadow container. Tailwind maps these with `@theme inline` after **clearing all default tokens** (`--*: initial`), which enforces both themability and a non-generic look. This is the model Linear (3 inputs, LCH) and Radix Themes (radius factor, scaling) use.

5. **Module boundaries** ([05](./05-module-boundaries.md)): package.json `exports` (hard wall) + **eslint-plugin-boundaries v7** (`boundaries/dependencies` with `default: 'disallow'` and `no-unknown-files`). It encodes:
   - modules ↛ modules, and packages ↛ modules or apps;
   - MAIN-world code with no extension APIs, React or storage;
   - DB access only from the background.
   Add dependency-cruiser in CI later for cycles and graphs, and knip for dead exports. Skip TS project references.

6. **Neon from MV3** ([06](./06-neon-from-mv3.md)): personal mode uses `@neondatabase/serverless` `neon()` HTTP in the background only. Product mode uses the Data API via **`@neon/neon-js`** (renamed from `@neondatabase/neon-js`; pre-1.0) with RLS on every table. Request `optional_host_permissions: https://*.neon.tech/*` on enabling sync. No CSP change is needed. Use a local-first outbox drained in short idempotent batches on `chrome.alarms` (30 s idle / 30 s fetch limits). Restrict `storage.local` to trusted contexts and never use `storage.sync` for secrets. Remote DB sync is permitted by CWS (it is data, not code) with in-UI consent.

## Top risks to resolve with spikes

- **CWS single-purpose policy** vs an "all-in-one" bundle. Frame one narrow purpose; standalone builds are the fallback.
- **Neon Auth from an extension**: `chrome-extension://` origins are undocumented. Spike the `launchWebAuthFlow` `https://<id>.chromiumapp.org/` redirect or email OTP.
- **WXT `entrypoints:found` with `inputPath` outside the app**. Otherwise use re-export entry files.
- **Tailwind v4 `@property` collisions** until WXT PR #2005 lands.
- **Firefox `data_collection_permissions`** must list optional `websiteContent` / `personalCommunications` once sync exists.
