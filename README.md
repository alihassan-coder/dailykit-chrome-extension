# Toolbelt

Your own browser tools in one extension. Each tool also builds as its own standalone extension.

| Product  | Folder          | What it is                                                          |
| -------- | --------------- | ------------------------------------------------------------------- |
| Toolbelt | `apps/toolbelt` | Every tool, switchable on and off. Personal use (unpacked).         |
| Cairn    | `apps/cairn`    | Save private Claude and ChatGPT chats, see context and usage. Sold. |

How it is put together, and the rules every change follows: [ARCHITECTURE.md](ARCHITECTURE.md).

## Develop

Needs Node 24 and pnpm 12. The project must sit on a Linux filesystem (ext4): pnpm needs symlinks.

```
pnpm install
pnpm dev            # Toolbelt with live reload in Chrome
pnpm dev:cairn      # Cairn standalone
pnpm check          # lint, format, types, tests, builds: run before every commit
```

| Command              | Does                                                            |
| -------------------- | --------------------------------------------------------------- |
| `pnpm build`         | Chrome builds of every product, in `apps/*/.output/chrome-mv3`  |
| `pnpm build:firefox` | Firefox (MV3) builds                                            |
| `pnpm zip`           | Store-ready zips                                                |
| `pnpm test`          | Unit tests (Vitest)                                             |
| `pnpm e2e`           | Real-browser tests; set `CHROME` to a Chrome for Testing binary |
| `pnpm changeset`     | Record a version change for the changelog                       |

Load a build: `chrome://extensions`, Developer mode, Load unpacked, pick `apps/<product>/.output/chrome-mv3`.

## Secrets

`.env` holds `DATABASE_URL` (Neon) and is never committed. Copy `.env.example` to start.

## Credits

Cairn is based on the MIT-licensed Cairn extension by the Cairn contributors; see `tools/cairn/LICENSE` and `tools/cairn/THIRD_PARTY_NOTICES.md`.
