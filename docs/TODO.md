# Toolbelt: what's asked for and where it stands

Updated 2026-11-01. One line per request; status: done, in progress, waiting (on a decision), declined.

## Shell and design

| Request                                                                                                           | Status      | Notes                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------- |
| One extension holding many tools, switch tools and features on and off, sort them                                 | done        | Dashboard → Tools                                                     |
| Customisation (accent incl. custom colour, mode, density, corners, text size, font, contrast, motion, rail style) | done        | Dashboard → Appearance                                                |
| Global settings (general, AI providers, data and sync, about)                                                     | done        |                                                                       |
| Logo for every tool                                                                                               | done        | tools/\*/src/icon.tsx                                                 |
| Side panel redesign: premium, Chrome-native, compact, not like a website                                          | in progress | Research: docs/research/design/. Mockup: docs/design/sidepanel-v2.png |
| Search bar always on top of the side panel                                                                        | in progress | Part of the redesign                                                  |
| Tool toolbar on the right edge, minimise / open toggle, styled hover tooltips with names                          | in progress | Part of the redesign                                                  |
| Responsive from 320 px to 600 px+                                                                                 | in progress | Part of the redesign                                                  |
| Lots of information, never boring                                                                                 | in progress | Part of the redesign                                                  |
| New Toolbelt logo, meaningful and detailed                                                                        | waiting     | Research first, then detailed options to choose from                  |

## Accounts, data, sync

| Request                                                               | Status | Notes                       |
| --------------------------------------------------------------------- | ------ | --------------------------- |
| Everything stored in the user's own Neon database (link in .env)      | done   |                             |
| Username + master password on first run, unlock after Chrome restarts | done   |                             |
| Several devices, each user kept separate (encrypted per user)         | done   |                             |
| Migrations managed correctly (Neon and local)                         | done   | packages/db/migrations/neon |
| API keys from the user, kept on the device and synced encrypted       | done   |                             |

## Tools

| Request                                                                                       | Status   | Notes                                                                                                                                                      |
| --------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colour picker                                                                                 | done     |                                                                                                                                                            |
| Black-and-white mode for any site                                                             | done     |                                                                                                                                                            |
| AI browser agent like Claude for Chrome: reads the page tree, screenshots, acts with approval | done     | tools/agent                                                                                                                                                |
| Anthropic, OpenAI, xAI Grok and Gemini with the user's own keys                               | done     | Vercel AI SDK for all four                                                                                                                                 |
| Models fetched at runtime from each provider (not hard-coded), searchable in the picker       | done     | tools/agent/src/models.ts, ModelPicker.tsx                                                                                                                 |
| Long-term memory with the mem0 open-source SDK, stored in Neon                                | next     | Needs an OpenAI or Gemini key for embeddings                                                                                                               |
| Chat history for claude.ai and chatgpt.com (Cairn port, new UI)                               | next     |                                                                                                                                                            |
| Use Claude through a Claude Code `setup-token` (subscription)                                 | declined | Anthropic's terms prohibit subscription OAuth tokens in third-party tools and they enforce it; risks the user's account. Use an Anthropic API key instead. |

## Quality

| Request                                   | Status        | Notes                                                           |
| ----------------------------------------- | ------------- | --------------------------------------------------------------- |
| Tests for every tool, plus app-wide tests | done, ongoing | `pnpm check`; test/architecture.test.ts enforces tests per tool |
| Readable, human code; best practices      | ongoing       | Lint rules for architecture boundaries                          |
| MIT licence, professional README          | done          |                                                                 |
