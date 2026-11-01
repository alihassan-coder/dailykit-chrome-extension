# 06: Neon Postgres directly from an MV3 extension (no backend)

Researched 2026-10-31. Versions (npm `latest`):

- `@neondatabase/serverless` **1.2.0** (2026-10-01)
- `@neon/neon-js` **0.10.2** (2026-10-30)
- `@neon/auth` 0.8.2
- `@neon/postgrest-js` 0.3.0

**Package rename alert:** `@neondatabase/neon-js` stops at `0.9.0-beta` (2026-10-21). Neon's Data API docs now point to the `@neon/*` scope. Use `@neon/neon-js`, not the package named in the project brief. Everything in the `@neon/*` scope is **pre-1.0**.

## Two modes, two clients

### Personal mode: user pastes a connection string → `@neondatabase/serverless`

Source: https://neon.com/docs/serverless/serverless-driver, https://github.com/neondatabase/serverless/blob/main/CONFIG.md

- `neon(connectionString)` returns a tagged-template query function. Each query is one HTTPS `fetch`. Since 1.0.0 (2025-03-25) it is tagged-template only; use `sql.query(text, params)` for dynamic SQL.
- `sql.transaction([...])` runs a non-interactive multi-statement transaction over HTTP, with isolation level and read-only options.
- The default `fetchEndpoint` is `host => 'https://' + host + '/sql'`, so requests go to the user's own endpoint host, e.g. `ep-xxx-123.us-east-2.aws.neon.tech`.
- `Pool`/`Client` over WebSockets also exist. `WebSocket` is a global in service workers, so `ws` is not needed, but you do not need sessions for sync. Stay on HTTP.
- When it runs in a browser-like context, the driver logs "Running SQL directly from the browser can have security implications". `disableWarningInBrowsers` silences it. In personal mode this is acceptable: the user's own credentials, the user's own database.
- Hardening to document for users:
  - Tell them to create a **dedicated Postgres role** for DailyKit with rights only on a `dailykit` schema, not the `neondb_owner` string.
  - Provide a "copy setup SQL" button.

### Product mode: Neon Data API + Neon Auth + RLS → `@neon/neon-js`

Source: https://neon.com/docs/data-api/get-started, https://neon.com/docs/auth/overview

- The Data API is PostgREST-style REST at `https://<endpoint>.apirest.<region>.aws.neon.tech/<db>/rest/v1/<table>`, with `Authorization: Bearer <JWT>`.
- It "has no permission layer of its own". All protection is `GRANT` plus **RLS** (`auth.user_id()` from the JWT `sub`). Tables without RLS let any authenticated user read all rows. Roles: `authenticated`, `anonymous`.
- JWTs last about 15 minutes, so the client must refresh. Tokens come from Neon Auth (Managed Better Auth; users and sessions live in the `neon_auth` schema, branch-isolated) or from external providers (Clerk, Auth0, Firebase). `@neon/postgrest-js` works with any JWT provider.
- The Data API is not available on projects with IP Allow or Private Networking.
- **Biggest uncertainty: auth redirects for an extension.**
  - Neon Auth only redirects to allow-listed domains, entered with `https://` (localhost is pre-approved, wildcards are allowed) (https://neon.com/docs/auth/guides/configure-domains).
  - **`chrome-extension://<id>` origins are not documented.**
  - Better Auth's own extension guide adds `chrome-extension://ID` to `trustedOrigins` (https://www.better-auth.com/docs/guides/browser-extension-guide), but with Neon's managed service you may not control that setting.
  - Options to spike:
    - (a) `chrome.identity.launchWebAuthFlow`, whose redirect URI is `https://<extension-id>.chromiumapp.org/`. That is an https URL, so it may be allow-listable. The Firefox equivalent is `https://<hash>.extensions.allizom.org/` via `browser.identity.getRedirectURL()`. Unverified with Neon Auth.
    - (b) Email OTP or magic-code sign-in, which needs no redirect.
    - (c) A tiny static https sign-in page on your domain that hands the token to the extension through `externally_connectable`. This is static hosting, not a backend.

## Manifest: CSP and host permissions

- **CSP:** the MV3 default `extension_pages` CSP restricts `script-src`/`object-src`. It does not restrict `connect-src`, so no CSP change is needed for `fetch`. Do **not** loosen the CSP. No remote code is loaded (see policy below).
- **Host permissions:** add `optional_host_permissions: ["https://*.neon.tech/*"]` and request it when the user turns on cloud sync. This covers both `ep-*.<region>.aws.neon.tech/sql` and `*.apirest.<region>.aws.neon.tech`.
  - Uncertain: if Neon serves permissive CORS on `/sql` (the driver is meant to work from browsers, which suggests it does), a fetch from the service worker might work even without host permission. Requesting the permission makes it independent of Neon's CORS policy, and the user-facing prompt ("read and change data on neon.tech") is honest.
  - Azure-hosted Neon projects use `*.azure.neon.tech`, which the same wildcard covers. Uncertain: check whether Neon exposes any non-`neon.tech` hosts.
- **Where secrets live:**
  - `chrome.storage.local` and `storage.sync` are **exposed to content scripts by default**. `storage.session` is not, and is memory-only, cleared on restart or update (https://developer.chrome.com/docs/extensions/reference/api/storage).
  - So call `chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` at startup (Chrome 102+). Uncertain: the docs reference it for local, but verify per-area support and Firefox support. If that is not possible, keep the connection string under a separate store that only the background reads.
  - Never put the connection string in `storage.sync`, because it is replicated to Google's servers.
  - The connection string is never passed to content scripts or pages. They send typed messages to the background, which runs queries. This matches boundary rule 4 in doc 05.

## Service-worker lifetime

Source: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle

- The worker terminates after **30 s idle**, after one request runs past **5 min**, or when a **`fetch` response takes more than 30 s** to arrive.
- Events and extension API calls reset the idle timer (Chrome 110+).
- An active WebSocket extends lifetime (Chrome 116+).
- `chrome.alarms` minimum period is 30 s (Chrome 120+).
- Firefox: the background is an **event page** (`background.scripts`) with similar idle unloading.

Design consequences:

- **Local-first is mandatory.** Every write goes to the local store (IndexedDB) plus an **outbox** queue. Sync drains the outbox in small batches (one `transaction()` per batch, a few hundred rows) and keeps each request well under 30 s.
- Triggers: `chrome.alarms` (e.g. every 5 min), on write (debounced), on `runtime.onStartup`, and from the dashboard's "Sync now" button. No keep-alive hacks are needed.
- Rows need client-generated UUIDs, `updated_at` plus a per-row `version` or HLC, soft deletes (`deleted_at`), and idempotent `INSERT … ON CONFLICT DO UPDATE WHERE excluded.version > t.version`. A retry after the worker is killed mid-batch is then harmless.
- Pull is `SELECT … WHERE updated_at > $cursor ORDER BY updated_at LIMIT n`, with the cursor stored locally.
- One sync engine in `packages/db` with two transports, SQL-over-HTTP (personal) and Data API (product), behind the same interface.

## Store policy

### Chrome Web Store

- **Remote code:** forbidden. "The full functionality of an extension must be easily discernible from its submitted code". No remote `<script>`, no `eval` of fetched strings, no interpreter of remotely fetched commands. **Syncing user account data with a remote server is explicitly given as permitted** (https://developer.chrome.com/docs/webstore/program-policies/mv3-requirements). SQL *strings sent to* a database are data leaving the extension, not code executed in it. Keep all SQL in the package, and never fetch SQL or "migrations" from a server to run.
- **User data:**
  - Saved chats are "website content" and "personal communications".
  - Transmit them over HTTPS only.
  - Show a **prominent in-UI disclosure and consent before** the first upload. A privacy policy or store listing alone does not satisfy this (https://developer.chrome.com/docs/webstore/program-policies/user-data-faq).
  - Publish a privacy policy with a Limited Use statement (https://developer.chrome.com/docs/webstore/program-policies/limited-use).
  - "Opt-in cloud sync" fits this as long as the consent screen is explicit.
- **Single purpose policy (major risk for the bundle):**
  - Policy text: "An extension must have a single purpose that is narrow and easy to understand… Don't create an extension that requires users to accept bundles of unrelated functionality… If two pieces of functionality are clearly separate, they should be put into two different extensions". Toolbars "that provide a broad array of functionality" are listed as a common violation (https://developer.chrome.com/docs/webstore/program-policies/quality-guidelines).
  - Mitigations:
    - Give the bundle one stated purpose that all modules serve (e.g. "productivity tools for AI chat sites"), and let the purpose guide which modules go into it.
    - Ship every module off by default with per-module permissions (doc 02).
    - The standalone-build requirement is also your fallback if a review objects.
  - This is a judgement call by reviewers and cannot be fully settled from the docs.

### Firefox AMO

- **`data_collection_permissions` is mandatory for new extensions from 2025-11-03** (Firefox 140+ desktop / 142+ Android) (https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).
- Cairn currently declares `required: ["none"]`. With opt-in sync, declare `required: ["none"]` plus `optional: ["websiteContent", "personalCommunications"]` (and `authenticationInfo` in product mode), and call `permissions.request()` when the user enables sync.
- Uncertain: whether syncing to the *user's own* database (personal mode) counts as "transmission" under Mozilla's definition. Declaring it as optional is the safe reading.

## Recommendation

- Personal mode: `@neondatabase/serverless` `neon()` over HTTP from the background only.
- Product mode: the Neon Data API via `@neon/neon-js` (not `@neondatabase/neon-js`), with RLS on every table.
- Both: `optional_host_permissions: https://*.neon.tech/*` requested when sync is enabled, no CSP changes, and a local-first outbox drained in short, idempotent batches on alarms.
- Before committing to product mode, spike Neon Auth sign-in from an extension (the `chromiumapp.org` redirect or email OTP), because extension origins are undocumented.
- Plan for the CWS single-purpose review risk of the bundle.
