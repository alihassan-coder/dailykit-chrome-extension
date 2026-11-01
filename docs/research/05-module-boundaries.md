# 05: Enforcing module boundaries as the codebase grows

Researched 2026-10-31. Versions (npm `latest`): eslint 10.14.0, eslint-plugin-boundaries **7.4.0** (2026-10-27), dependency-cruiser **18.7.0** (2026-10-19), typescript **7.0.2**, knip 6.44.1, pnpm 12.16.1.

## The boundaries DailyKit actually needs

1. **Modules never import each other** (`modules/cairn` ↛ `modules/x`). Cross-module features go through `core` (typed event bus / messaging / registry).
2. Modules may import only `packages/core`, `packages/ui`, `packages/db` **public entrypoints**, never their internals.
3. `packages/*` never import `modules/*` or `apps/*`. Apps are composition roots only.
4. **Execution-context rules** (Cairn already enforces these with a test):
   - `main-world/` code can import only `main-world/` and pure shared code, with no `browser.*`, no React, no storage.
   - `background/` cannot import React or DOM UI.
   - Content UI cannot import `db` drivers. DB access goes through background messaging, because the connection string must stay in the background (see 06).
5. Shared code never names a site, and sites never reference each other. This is Cairn's existing rule.

## Tools compared

| Tool | Granularity | Strengths | Weaknesses |
| --- | --- | --- | --- |
| **package.json `exports`** + pnpm workspace | Package | A hard wall enforced by the resolver: `@dailykit/core/internal/x` simply fails to resolve unless exported. Free, and the editor understands it. | Does nothing about relative paths (`../../packages/core/src/...`), nothing about who may depend on whom (any package can add any dependency), and nothing inside a package. |
| **eslint-plugin-boundaries** v7 | File/folder "elements" via glob patterns | In-editor feedback. One rule, `boundaries/dependencies`, with `default: 'disallow'` and allow/disallow policies by element type, captured names, file internal path, and external module origin. Also `no-unknown-files` and `no-unknown-dependencies`. | ESLint-speed. v7 renamed and deprecated rules: `element-types`, `entry-point`, `external` and `no-private` are now all folded into `dependencies`. Old blog posts are outdated. Needs a TS import resolver set up for path aliases (see its TypeScript Support guide). |
| **dependency-cruiser** 18 | Any path regex, whole graph | Graph-level rules (`no-circular`, orphans via `numberOfDependentsLessThan`), capture groups for "peer folders can't import each other" (`from: (^features/)([^/]+)/` → `to: ^$1, pathNot: $1$2`), and SVG/HTML graph output for reviews. | CI/CLI only, no in-editor squiggles. A separate config language (JS/JSON regexes). |
| **TS project references** | Package | Enforces *declared* dependencies at the type level, and gives incremental builds. | Doesn't express "who may depend on whom" beyond the reference list. Adds `composite` and declaration-emit overhead. Uncertain: TS 7.0 (the native port) behaviour with project references was not verified here. Unnecessary when WXT/Vite does the real bundling. |

Sources:
- https://github.com/javierbrea/eslint-plugin-boundaries
- https://www.jsboundaries.dev/docs/rules/
- https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-tutorial.md
- https://nodejs.org/api/packages.html#exports

## Recommendation

**Primary: `exports` + eslint-plugin-boundaries.**

- Packages get a hard wall from `exports` (each package exports `.` plus a few named subpaths, e.g. `@dailykit/cairn/wxt`).
- **eslint-plugin-boundaries** encodes rules 1–5 as element types: `app`, `module`, `core`, `ui`, `db`, `wxt-kit`, plus inside modules `module-main-world`, `module-background`, `module-content`, `module-pages`, `module-sites`. Use the `default: 'disallow'` policy and `no-unknown-files` so new folders must be classified.
- Run it in the editor and in CI, with `--max-warnings 0`.

Add **dependency-cruiser** later, in CI only, with `no-circular` plus a generated graph for PR review, if cycles start appearing. Skip TS project references unless typecheck time becomes a problem. Run **knip** for unused exports and dependencies, which keeps package surfaces honest.

Sketch, illustrative only:

```js
// tooling/eslint-config/boundaries.js
settings: {
  'boundaries/elements': [
    { type: 'app',        pattern: 'apps/*',                capture: ['app'] },
    { type: 'mod-main',   pattern: 'modules/*/src/main-world', capture: ['mod'] },
    { type: 'mod-bg',     pattern: 'modules/*/src/background', capture: ['mod'] },
    { type: 'mod',        pattern: 'modules/*',             capture: ['mod'] },
    { type: 'core',       pattern: 'packages/core' },
    { type: 'ui',         pattern: 'packages/ui' },
    { type: 'db',         pattern: 'packages/db' },
  ],
},
rules: {
  'boundaries/dependencies': ['error', { default: 'disallow', policies: [
    { from: { element: { type: 'app' } },  allow: { to: { element: { type: ['mod','core','ui','db'] } } } },
    { from: { element: { type: 'mod' } },  allow: { to: { element: { type: ['core','ui'] } } } },
    // same-module imports: allow when captured mod matches (see policy docs for capture templating)
    { from: { element: { type: 'mod-main' } }, allow: { to: { element: { type: 'mod-main' } } } },
    { from: { element: { type: 'mod-bg' } },   allow: { to: { element: { type: ['core','db'] } } } },
  ] }],
  'boundaries/no-unknown-files': 'error',
}
```

Check the exact v7 policy and capture-template syntax against https://www.jsboundaries.dev before copying this. The selector shapes changed in v6/v7.

Also keep **Cairn's existing test-based rules** (manifest load order, worlds never mixing) as unit tests. Port them to read the module descriptors instead of `manifest.json`.
