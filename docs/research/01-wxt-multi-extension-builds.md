# 01: One codebase, many extensions with WXT

Researched 2026-10-31. WXT **0.21.5** (released 2026-10-26) is the current version. It is still pre-1.0, and a `v1.1` milestone already exists on GitHub.

## What WXT gives you out of the box

| Mechanism | What it does | Source |
| --- | --- | --- |
| `wxt build [root] -c <file>` | Builds with a specific config file. Other flags: `-m/--mode`, `-b/--browser`, `-e/--filter-entrypoint`, `--mv2/--mv3`, `--analyze`. | https://wxt.dev/api/cli/wxt-build.html |
| `filterEntrypoints: string[]` | "A list of entrypoint names to build". If set, it overrides each entrypoint's `include`/`exclude`. | https://wxt.dev/api/reference/wxt/interfaces/InlineConfig.html |
| Per-entrypoint `include`/`exclude` | Selects by **browser** only, not by product. | https://wxt.dev/guide/essentials/target-different-browsers.html |
| `manifest: (env) => ({...})` | Function form. It receives `mode`/`browser`, so `.env.[mode]` values can drive name and permissions. | https://wxt.dev/guide/essentials/config/environment-variables.html |
| `outDir`, `outDirTemplate` (`{{browser}}-mv{{manifestVersion}}{{modeSuffix}}`), `zip.artifactTemplate` | Per-build output naming. | InlineConfig (above) |
| `srcDir`, `entrypointsDir`, `publicDir`, `modulesDir` | Every directory can be moved, using absolute or relative paths. | https://wxt.dev/guide/essentials/project-structure.html |
| WXT modules (`modules: [...]` or a local `modules/` dir) | Build hooks: `config:resolved`, `entrypoints:found` (push `{name, inputPath, type}`), `entrypoints:resolved`, `build:manifestGenerated`, `build:publicAssets`, `prepare:types`, `vite:build:extendConfig`, and others (23 in total). A module can take typed options through `configKey`. | https://wxt.dev/guide/essentials/wxt-modules.html, https://wxt.dev/api/reference/wxt/interfaces/WxtHooks.html |

The FAQ and guides say nothing about building "multiple products from one repo", so WXT has no first-class feature for it. Two community examples exist: `wong2/browser-extensions` (one WXT package per extension under `packages/`, using Bun) and WXT discussion #572 (Nx). Neither publishes a pattern for shared feature packages. Sources: https://github.com/wong2/browser-extensions, https://github.com/wxt-dev/wxt/discussions/572.

Entrypoint loader caveat (https://wxt.dev/guide/essentials/config/entrypoint-loaders.html): WXT **imports every JS/TS entrypoint in Node** (with linkedom and a fake `browser`) to read its options. It strips `main` only in the entry file. Any module package that an entrypoint re-exports must therefore have **no browser side effects at top level**. `wxt prepare --debug` prints the pre-processed code when this breaks.

## Option A: one WXT project, several config files

```
wxt.config.ts            # DailyKit bundle
wxt.cairn.config.ts      # filterEntrypoints: ['cairn-*', 'background', 'popup'], own manifest + outDir
```

`wxt build -c wxt.cairn.config.ts -b firefox`

- **Pros:** zero monorepo tooling, and adding a standalone build is quick.
- **Cons:**
  - Every product shares one `entrypoints/`, `public/` and `.wxt/` types dir. Running dev for two products at once fights over `.wxt` (uncertain: not documented, but `wxt prepare` writes one `.wxt` per root).
  - `filterEntrypoints` works by **name**, so naming conventions are your only boundary.
  - The standalone build still needs its own background, popup and options entrypoints, which leads to `background.cairn.ts`-style duplicates.
  - Per-product icons, `_locales` and store assets have to be juggled with `publicDir` per config.
  - Nothing stops the bundle's code from leaking into the standalone build.
- It works for one or two spin-offs and becomes unpleasant at five or more.

## Option B (recommended): pnpm workspace, one WXT app per sellable target

```
dailykit/
  pnpm-workspace.yaml        # packages: ['apps/*', 'packages/*', 'modules/*', 'tooling/*']
  apps/
    dailykit/                # WXT project: the all-in-one bundle
      wxt.config.ts          # modules: ['@dailykit/wxt-kit'], dailykit: { modules: [cairn, ...], mode: 'bundle' }
      entrypoints/           # thin: background.ts, dashboard/, popup/, + generated/re-exported module entrypoints
      public/                # bundle icons, _locales
    cairn/                   # WXT project: Cairn standalone (same module code)
      wxt.config.ts          # dailykit: { modules: [cairn], mode: 'standalone' }
      entrypoints/
      public/
  modules/                   # one package per feature ("module" in DailyKit terms)
    cairn/
      package.json           # "exports": { ".": "./src/index.ts", "./wxt": "./src/wxt.ts" }
      src/
        index.ts             # defineDailyKitModule({ id, name, permissions, hostMatches, contentScripts, pages, settingsSchema })
        background/          # handlers registered into the host's background
        content/             # isolated-world entry + React UI
        main-world/          # MAIN-world fetch wrapper + per-site bridges (no extension APIs)
        sites/claude, sites/chatgpt   # adapters
        pages/library/       # extension page
  packages/
    core/                    # module contract, typed messaging, storage, settings, module registry, sync queue
    ui/                      # React components, tokens, Tailwind entry CSS, shadow-root helpers
    db/                      # local store + Neon adapters (personal / product), schema/migrations
    wxt-kit/                 # the WXT module that turns module descriptors into entrypoints + manifest
  tooling/
    eslint-config/  tsconfig/
```

How it fits together:

1. Each feature package exports a **plain-data descriptor**: id, required permissions, `hostMatches`, its content scripts (`{ id, entry, world, runAt }`), pages, and settings schema. The descriptor contains no code that touches browser APIs.
2. `@dailykit/wxt-kit` is a WXT module with `configKey: 'dailykit'`. Inside, it uses three hooks:
   - **`entrypoints:found`**: pushes each module's entry files as entrypoints (`{ name: 'cairn-bridge', inputPath: require.resolve('@dailykit/cairn/main-world/claude.ts'), type: 'content-script' }`). Uncertain: the docs show `inputPath` but do not say whether paths outside `srcDir` are accepted. The fallback is thin re-export files in `apps/*/entrypoints/` (`export { default } from '@dailykit/cairn/entry/bridge'`), which avoids the question entirely.
   - **`build:manifestGenerated`**: in `standalone` mode it writes the module's hosts as `host_permissions` and its scripts as `content_scripts`. In `bundle` mode it moves hosts to `optional_host_permissions` and strips the static `content_scripts`, because they are registered at runtime (see 02).
   - **`prepare:types`**: emits a generated `#dailykit/manifest` module that maps each script id to its bundled path. The maintainer calls this "the correct way to do this today" for referencing built content-script paths (https://github.com/wxt-dev/wxt/issues/2040).
3. Each app's `background.ts` stays a few lines long: `startHost({ modules: [cairn], mode })`.

Tradeoffs of B:

- **Pros:**
  - Package `exports` give a hard wall between modules (see 05).
  - Each product has its own `public/`, icons, `_locales`, `gecko.id` and version.
  - `pnpm --filter @dailykit/app-cairn build` builds one product.
  - Dev servers run independently.
- **Cons:**
  - The workspace setup (tsconfig bases, the Tailwind `@source` paths that scan `modules/*`) is fiddly.
  - The `wxt-kit` module is code you own.
  - The two apps' versions need a release policy (changesets or similar).
- **Tailwind gotcha:** Tailwind v4 scans from the current working directory and skips `node_modules` and `.gitignore`d files. Workspace packages linked into `node_modules` are therefore not scanned. Each app's CSS needs `@source "../../modules/*/src"` and `@source "../../packages/ui/src"`, or use `@import "tailwindcss" source(none)` plus explicit `@source` lines. Otherwise classes used only inside packages disappear (https://tailwindcss.com/docs/detecting-classes-in-source-files).

## Turborepo?

It is not needed on day one. `pnpm -r --filter` already does topological builds. Turborepo (2.11.x) adds content-hash caching and remote cache, which pays off once CI runs four or more app×browser builds plus tests. The layout above is turbo-ready, so you only add `turbo.json` later. Nx is heavier and has no WXT-specific benefit.

## Recommendation

Use Option B: a pnpm workspace with `apps/<product>` WXT projects, `modules/<feature>` packages, `packages/{core,ui,db,wxt-kit}`, and a small in-house WXT module that maps module descriptors to entrypoints and to a manifest per mode (bundle vs standalone). Keep Option A's `-c` + `filterEntrypoints` only for quick experiments.

## Open items / uncertain

- Whether `entrypoints:found` accepts `inputPath` outside the app root. Test this in a spike, and fall back to re-export files.
- `@wxt-dev/entrypoint-refs` (auto-generated entrypoint path constants) was proposed in #2040 but has not shipped as of 2026-10-31.
- WXT is pre-1.0, so pin the exact version and read its release notes before each upgrade.
