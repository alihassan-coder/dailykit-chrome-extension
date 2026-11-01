# 03 · Calling LLM providers directly from an MV3 extension

Question: how to call Anthropic, OpenAI, xAI Grok and Google Gemini from a service worker or side panel with no backend. Covers CORS, streaming, tool calling, image input, current model IDs, a common abstraction, and key storage.

Researched 2026-11-01. Facts marked **(unverified)** come from memory or secondary sources and were not confirmed against a primary source today.

## TL;DR

- **CORS is not the problem.** Extension service workers and extension pages (including the side panel) can fetch any host listed in `host_permissions`. Toolbelt has `<all_urls>`. Content scripts **cannot**, so never call providers from a content script. ([Chrome: cross-origin requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests))
- For Anthropic, send `anthropic-dangerous-direct-browser-access: true` anyway. Extension requests carry an `Origin: chrome-extension://…` header, and Anthropic gates browser-origin requests on this header. The TS SDK sets it when `dangerouslyAllowBrowser: true`.
- Run the agent loop in the **side panel** (or an offscreen document), not the service worker. An MV3 service worker can be stopped while idle, which kills long SSE streams and multi-step loops. Use `fetch` with `ReadableStream` to parse SSE yourself, because `EventSource` cannot POST or set headers.
- Wire formats: **Anthropic Messages**, **OpenAI Responses**, **xAI Responses (OpenAI-compatible, base `https://api.x.ai/v1`)**, and **Gemini** (`generateContent` is now "legacy but fully supported", and the Interactions API is GA and recommended). That is three adapters, since xAI reuses the OpenAI adapter with a different base URL.
- Default models for an agent (late 2026): `claude-sonnet-5-5`, `gpt-6.1-sol`, `grok-4.7`, `gemini-3.8-flash`. Stronger models: `claude-opus-5-5`, `gpt-6-astra`, `gemini-4-argon`.

## Findings

### CORS and where to make the call

| Fact | Source |
|---|---|
| "A script in an extension service worker or foreground tab can talk to remote servers outside of its origin, as long as the extension requests host permissions." | [Chrome docs](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests) |
| "Cross-origin requests are always treated as such in content scripts, even if the extension has host permissions." | same |
| Firefox: extension background and pages with host permissions get the same exemption from cross-origin checks **(unverified today)**. | [MDN: host_permissions](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/host_permissions) |
| Anthropic enabled CORS through the `anthropic-dangerous-direct-browser-access: true` request header (Aug 2024). | [Simon Willison, 2024-08-23](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access) (secondary) |
| The Anthropic TS SDK disables browser use by default "to avoid exposing your secret API credentials". Enable it with `dangerouslyAllowBrowser: true`. | [anthropic-sdk-typescript README](https://github.com/anthropics/anthropic-sdk-typescript) |
| Without that header, a request that carries an `Origin` gets a 401 asking for it **(unverified)**. Send the header unconditionally. | — |
| OpenAI, xAI and Gemini behaviour for browser origins **(unverified)**. Host permissions make it moot inside extension pages. The OpenAI JS SDK also has a client-side `dangerouslyAllowBrowser` guard. | — |

Narrow `host_permissions` for the store build later: `https://api.anthropic.com/*`, `https://api.openai.com/*`, `https://api.x.ai/*`, `https://generativelanguage.googleapis.com/*`.

### Anthropic (Messages API)

- `POST https://api.anthropic.com/v1/messages`. Headers: `x-api-key`, `anthropic-version: 2023-06-01`, `content-type`, `anthropic-dangerous-direct-browser-access: true`.
- Tools: `{name, description, input_schema}`. The model returns `{"type":"tool_use", id, name, input}` content blocks. You reply in a `user` turn with `{"type":"tool_result", tool_use_id, content:[text|image blocks], is_error?}`. **Tool results can contain images**, which suits screenshots.
- Images: `{"type":"image","source":{"type":"base64","media_type":"image/jpeg","data":"…"}}`. Limits on Opus 4.7+ models: long edge ≤ 2,576 px and ≤ 4,784 visual tokens. Oversized images are rejected, and a stricter limit applies past 20 images ([computer use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)).
- Streaming: `stream:true` gives SSE events `message_start`, `content_block_start`, `content_block_delta` (`text_delta` / `input_json_delta`), `content_block_stop`, `message_delta` (stop_reason), `message_stop`.
- **Option: the built-in browser toolset.** Declare `tools:[{"type":"browser_toolset_20260801"}]` and Claude uses the same tool surface as Claude in Chrome (`read_page`, `find`, click with `{type:"ref"}` targets, and so on). Results must echo `toolset_name:"browser"`. It is stable, needs no beta header, and works with `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`, `claude-fable-5-1` and others. Anthropic scans its results with injection classifiers ([browser use tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool)). Toolbelt can use it on the Anthropic path and send the **same tool names and schemas as custom functions** to the other three providers, so one executor serves all four.
- Models ([models overview](https://platform.claude.com/docs/en/about-claude/models/overview), read 2026-11-01). All have 1M context, 128K output, vision and tools:

| ID | Use | Price in/out per MTok |
|---|---|---|
| `claude-fable-5-1` | hardest, long-horizon | $10 / $50 |
| `claude-opus-5-5` | Anthropic's default recommendation | $4 / $20 |
| `claude-sonnet-5-5` | **Toolbelt default**: speed plus intelligence | $2 / $10 |
| `claude-haiku-5-5` | cheap and fast | from $0.10 / $0.50 |

### OpenAI (Responses API)

- `POST https://api.openai.com/v1/responses`, `Authorization: Bearer`. **GPT-6 Astra and GPT-6.1 Sol require the Responses API for tool calling** ([function calling guide](https://developers.openai.com/api/docs/guides/function-calling)). Do not build on Chat Completions.
- Tools: `{type:"function", name, description, parameters, strict}`. With `strict:true`, every object needs `additionalProperties:false` and every property listed in `required` (use a `null` union for optional fields). Output items: `{type:"function_call", id, call_id, name, arguments: "<json string>"}`. Reply with an input item `{type:"function_call_output", call_id, output}`, where **`output` may be an array including images**.
- Images: `{type:"input_image", image_url:"data:image/jpeg;base64,…", detail:"low|high|original|auto"}` ([images guide](https://developers.openai.com/api/docs/guides/images-vision)).
- Streaming: `stream:true` gives SSE events including `response.output_text.delta`, `response.output_item.added`, `response.function_call_arguments.delta` / `.done`, `response.output_item.done`, and `response.completed`.
- State: send the full `input` each turn with `store:false` (stateless, nothing kept server-side), or chain with `previous_response_id`.
- Models ([models page](https://developers.openai.com/api/docs/models), read 2026-11-01). All list functions and computer use:

| ID | Role | Price in/out |
|---|---|---|
| `gpt-6-astra` | frontier | $10 / $50 |
| `gpt-6.1-sol` | **Toolbelt default**, balanced | $2 / $10 |
| `gpt-6.1-terra` | fast; "precise computer use" | $1 / $5 |
| `gpt-6-luna` | cheap | $0.10 / $0.50 |

### xAI Grok

- Base `https://api.x.ai/v1`, `Authorization: Bearer`. The OpenAI SDK works by changing `base_url`, and the docs' examples use **`/v1/responses`** ([function calling](https://docs.x.ai/docs/guides/function-calling)). Chat Completions is also offered **(unverified today)**.
- Tools have the same shape as OpenAI's (`type:"function"`, name, JSON-schema `parameters` with an object root), up to 350 tools. `function_call` / `function_call_output` with `call_id`. `tool_choice` is `auto|required|none|{name}`, and parallel calls are on by default (`parallel_tool_calls:false` to disable). **Function calls arrive in one chunk when streaming, not incrementally.**
- Images: JPEG or PNG up to 20 MiB ([models page](https://docs.x.ai/docs/models)). Which models accept images, and whether `function_call_output` can carry images, is **unverified**. Fallback: attach the screenshot as an `input_image` in a following user message.
- Models: `grok-4.7` (500k context; used in every example, so the **Toolbelt default**), `grok-4.6`, `grok-4.5`, `grok-4.3` (1M), `grok-4.20-0309-reasoning` / `-non-reasoning` (1M).

### Google Gemini

- Auth header `x-goog-api-key` on `https://generativelanguage.googleapis.com`.
- **Interactions API** (`POST /v1beta/interactions`) is GA as of June 2026 and "recommended for all new projects". `generateContent` "is now considered legacy, [but] remains fully supported" ([Interactions overview](https://ai.google.dev/gemini-api/docs/interactions), updated 2026-10-15).
  - Tools: `{type:"function", name, description, parameters}`. The model emits a `function_call` step `{id, name, arguments}`. Reply with `{type:"function_result", name, call_id, result:[{type:"text",text}]}`.
  - Stateless use: `store:false` and resend history. **Pass back the model's `thought` and `function_call` steps exactly as received** (they carry thought signatures).
  - Streaming: `stream:true` gives SSE events `interaction.created`, `step.start`, `step.delta` (`text`, `arguments_delta`, …), `step.stop`, `interaction.completed`, `error`, then `[DONE]`. Skip unknown events ([streaming](https://ai.google.dev/gemini-api/docs/interactions/streaming)).
  - The image **input** shape is **unverified** (output images use `{type:"image", mime_type, data}`, so input is probably the same).
- **generateContent** (fallback): `POST /v1beta/models/{model}:streamGenerateContent?alt=sse`, with `tools:[{function_declarations:[…]}]` and images as `{inline_data:{mime_type, data}}` parts ([API reference](https://ai.google.dev/api/generate-content)). The `functionCall` / `functionResponse` parts and `thoughtSignature` echo requirement were not re-verified today.
- Models ([models page](https://ai.google.dev/gemini-api/docs/models), updated 2026-10-28): the page recommends **`gemini-3.8-flash`** (**Toolbelt default**) or `gemini-3.5-flash-lite` for new projects, with `gemini-4-argon` as flagship. The old computer-use preview (`gemini-2.5-computer-use-preview-10-2025`) is shut down. Per-model tool and vision support is listed on each model page, **not verified today**.

### A minimal common abstraction

```ts
type Part =
  | { kind: 'text'; text: string }
  | { kind: 'image'; mime: 'image/jpeg' | 'image/png'; base64: string };

type Msg =
  | { role: 'user'; parts: Part[] }
  | { role: 'assistant'; parts: Part[]; toolCalls: ToolCall[]; raw?: unknown } // raw = provider-native items to echo back (Gemini thought steps, OpenAI reasoning items)
  | { role: 'tool'; results: ToolResult[] };

interface ToolCall { id: string; name: string; args: unknown }
interface ToolResult { callId: string; name: string; parts: Part[]; isError?: boolean }
interface ToolDef { name: string; description: string; schema: JSONSchema } // object root, strict-compatible

type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; call: ToolCall }        // emit only when complete; never act on partial JSON
  | { type: 'done'; stop: 'end' | 'tool' | 'length' | 'refusal'; usage?: Usage }
  | { type: 'error'; message: string; retryable: boolean };

interface Provider {
  id: 'anthropic' | 'openai' | 'xai' | 'gemini';
  stream(req: { model: string; system: string; messages: Msg[]; tools: ToolDef[]; signal: AbortSignal }): AsyncIterable<StreamEvent>;
}
```

Mapping notes:

| Concept | Anthropic | OpenAI / xAI (Responses) | Gemini (Interactions) |
|---|---|---|---|
| system | top-level `system` | `instructions` | `system_instruction` **(unverified)** |
| tool call id | `tool_use.id` | `call_id` | `function_call.id` → `call_id` |
| tool result | `tool_result` block in a user turn | `function_call_output` item | `function_result` step |
| image in a tool result | yes | yes (array output; xAI unverified) | unverified, so send it as a user part |
| must echo opaque items | thinking blocks (signature) | reasoning items if `store:false` **(unverified)** | thought + function_call steps |

Design rules:

- Keep the adapter **stateless**. Resend history, use `store:false` where offered, and keep `raw` per assistant turn so each adapter can replay provider-native items untouched.
- Emit a `tool_call` only after the arguments are complete. xAI sends them whole, and Anthropic's `input_json_delta` and OpenAI's `function_call_arguments.delta` need accumulating.
- Write tool schemas in the strict-compatible subset (object root, all properties required, nullable for optional, no `oneOf` at the root), so the same schema passes OpenAI strict mode, xAI and Gemini.
- If an image cannot go in a tool result, put a text result ("screenshot attached below") plus a user message holding the image.
- Normalize errors: 401 means a bad key, 429 means back off using `retry-after`, 529/503 means overloaded.

### Key storage

| Fact | Source |
|---|---|
| `storage.local` is **exposed to content scripts by default**. Restrict it with `storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'})`. | [chrome.storage](https://developer.chrome.com/docs/extensions/reference/api/storage) (updated 2026-10-29) |
| The docs do not say `storage.local` is encrypted. Treat it as plaintext on disk in the profile. | same |
| `storage.session` is in memory only, 10 MB, cleared on browser restart, extension reload or update, and **not exposed to content scripts by default**. | same |
| Anthropic warns that keys in client code can be stolen by anyone who can reach the page. Bring-your-own-key for trusted users is the accepted use case. | [Willison](https://simonwillison.net/2024/Aug/23/anthropic-dangerous-direct-browser-access), [SDK README](https://github.com/anthropics/anthropic-sdk-typescript) |

Advice:

1. Store keys in `storage.local` under one namespace, and call `setAccessLevel(TRUSTED_CONTEXTS)` at startup. Never send keys to content scripts, and never put them in a message the page could observe.
2. Make all provider calls from the side panel or service worker only.
3. Offer a "don't remember" option that keeps the key in `storage.session`. Optionally encrypt at rest with a WebCrypto AES-GCM key derived from a user passphrase (PBKDF2). This protects against disk theft only, not a compromised extension.
4. Never sync keys (`storage.sync`). Mask them in the UI, never log them, and redact them from error reports.
5. Tell users to create **restricted, spend-limited keys** per provider.
6. Treat model output as untrusted. The model must never be able to read the keys. Do not give it `javascript_exec` in extension contexts.

## Open questions

- The xAI vision model list and image-in-tool-result support.
- Gemini Interactions image input shape and `system_instruction` field name. Check the Interactions API reference before writing the adapter.
- Exact CORS response for OpenAI, xAI and Gemini when an `Origin: chrome-extension://` header is present. Verify with one request each in the dev build.
