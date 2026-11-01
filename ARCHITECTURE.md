# Toolbelt architecture

Toolbelt is one browser extension that holds many **tools**. The same tool code also builds as its own standalone extension, which is what gets sold. The Toolbelt bundle itself is for personal use (loaded unpacked or unlisted), because the Chrome Web Store does not accept multi-purpose bundles.

## Layout

```
apps/                     one WXT project per product that ships
  toolbelt/               the bundle: every tool, side panel, dashboard, popup
  cairn/                  Cairn standalone
tools/                    one package per tool
  cairn/
    src/index.ts          the ToolDescriptor (plain data, see below)
    src/entries/          WXT entry files (content scripts, pages) the apps pick up
packages/
  core/                   tool contract, registry, storage, migrations, messaging
  ui/                     theme tokens, components, shadow-root helpers
  db/                     local store and Neon sync adapters
  wxt-kit/                WXT module that turns descriptors into entrypoints and manifests
docs/
  research/               why things are the way they are (with sources)
  design/                 mockups
```

## Rules

These are enforced by lint (`pnpm lint`) and package `exports`, not by memory.

1. **Tools never import each other.** A tool may import `@toolbelt/core` and `@toolbelt/ui`. Tools cooperate through the core message bus and registry.
2. **Packages never import tools or apps.** Apps are composition roots: they list tools and start the shell.
3. **Only the background touches the database.** `@toolbelt/db` is imported by background code only. The Neon connection string never reaches a content script, a page script or an extension page.
4. **Page-world code is isolated.** Files under a tool's `main-world/` run inside the website. They may not import extension APIs, React, storage or anything outside `main-world/`.
5. **Descriptors are plain data.** `src/index.ts` of a tool has no top-level browser calls, because the build imports it in Node.
6. **Every visual value is a theme token.** No hard-coded colours, sizes or radii in tools. See `packages/ui`.
7. **Stable ids.** A tool id, a feature id and a storage key never change once shipped. Data changes go through numbered migrations.

## Bundle vs standalone

| | Bundle (`apps/toolbelt`) | Standalone (`apps/cairn`) |
| --- | --- | --- |
| Site access | `optional_host_permissions`, asked when the tool is switched on | `host_permissions`, shown at install |
| Content scripts | registered at runtime by the background (`tb:<tool>:<script>`) | static in the manifest |
| Switch tools on and off | yes, live from the dashboard | n/a |

`wxt-kit` produces both from the same descriptor.

## Data and accounts

Local first: every tool reads and writes on the device. Sync to Neon is opt-in per tool and runs from the background in small batches. Records are end-to-end encrypted with a key derived from the user's master password (Argon2id, AES-GCM); Neon only stores ciphertext, a salt and a check value. Details: `docs/research/06-neon-from-mv3.md`.

## UX rules

`docs/research/ux/00-summary.md` is the checklist every screen is reviewed against.
