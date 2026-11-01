# 01 · Claude in Chrome and comparable browser agents

Question: what Anthropic's browser extension ("Claude for Chrome", now "Claude in Chrome") does, how it reads pages and acts, how it asks permission, what it does against prompt injection, the attack numbers Anthropic has published, and how open-source agents represent pages to the model.

Researched 2026-11-01. Facts marked **(unverified)** come from secondary or reverse-engineered sources, not from the vendor.

## TL;DR

- Claude in Chrome is a side-panel agent that reads the page through an **accessibility-tree dump with `ref_N` element IDs**, falls back to **screenshots plus pixel coordinates**, and acts through the **`chrome.debugger` (CDP) API**. Anthropic has now published the same tool surface as a public API toolset, `browser_toolset_20260801`, which Toolbelt can copy directly.
- Permission model: three modes (Manually approve / Automatically approve / Skip all approvals). In manual mode the options are per action, "Always allow actions on this site", or decline. Some actions **always** need approval (sensitive data entry, authorizations, permission changes). Some are **banned outright** (purchases, account creation, permanent deletion, following instructions found in web content).
- Defenses are layered: RL training against injections, classifiers ("probes") that scan every tool result, an action classifier that checks each action against the user's request, blocked site categories (financial, adult, pirated), and admin allow/block lists.
- Published attack success rates fell from **23.6% (Aug 2025, no mitigations)** to **about 1–2% (Nov 2025, best-of-N attacker, improved safeguards)**. On the newer, harder evaluation (Aug 2026), the figure was **0% for Opus 5 / Sonnet 5 / Mythos 5 with probes plus the classifier**. Anthropic still says prompt injection is not solved.
- Open-source agents (browser-use, nanobrowser) and Google's Chrome agent all build a **compact indexed element list** from CDP (DOM + DOMSnapshot + AX tree). Google adds an isolated **"User Alignment Critic"** model and per-task **origin sets**.

## Findings

### What it is and its timeline

| Date | Event | Source |
|---|---|---|
| 2025-08-25 | Research preview for 1,000 Max users. The examples are calendar, email drafting, expense reports and testing site features. | [claude.com/blog/claude-for-chrome](https://claude.com/blog/claude-for-chrome) |
| 2025-11-24 | Beta for all Max users. Classifiers and the post-detection intervention were improved. | same; [anthropic.com/research/prompt-injection-defenses](https://www.anthropic.com/research/prompt-injection-defenses) |
| 2025-12-18 | Opened to Pro, Team and Enterprise. Later updates added scheduled tasks, multi-tab workflows and a Claude Code integration. | [claude.com/blog/claude-for-chrome](https://claude.com/blog/claude-for-chrome) (update notes) |
| 2026-08-26 | General availability. "Automatically approve" mode uses the same mechanism as Claude Code auto mode. | [claude.com/blog/claude-in-chrome-generally-available](https://claude.com/blog/claude-in-chrome-generally-available) |

UX: a Chrome side panel, signed in with a Claude account. There are now two panels, the "classic" one and a "Cowork side panel" ([permissions guide](https://support.claude.com/en/articles/12902446)). In the classic panel, manual mode starts with a **plan** that lists the domains it will touch and 3–7 approach steps (the `update_plan` tool, see below). The agent works in a **tab group** it owns (`tabs_context` / `tabs_create` tools) **(unverified, reverse-engineered)**. A user-filed issue from June 2026 says the "started debugging this browser" infobar shows on every tab ([claudeissues.com #69287](https://claudeissues.com/issue/69287-claude-in-chrome-started-debugging-this-browser-banner-shows-on-every-tab-please), secondary), which confirms it uses `chrome.debugger`.

### How it reads pages and acts

Anthropic does not document the extension's internals. A tool dump of the extension, dated 2026-03-01 ([gist sshh12](https://gist.github.com/sshh12/e352c053627ccbe1636781f73d6d715b), **unverified**), lists 21 tools:

- `read_page(filter: interactive|all, depth=15, ref_id?, max_chars=50000)` returns an **indented accessibility-style tree**. Each line has a role, accessible name, `[ref_N]` and useful attributes (href, type, placeholder), and `<select>` options appear as children. The tree is built by a function injected with `chrome.scripting.executeScript` (`window.__generateAccessibilityTree`). Refs live in `window.__claudeElementMap` as `WeakRef`s, so **a ref stays the same element across calls** until the element is garbage-collected.
- `find(query)` matches elements by natural language and returns up to 20 with refs and coordinates. `get_page_text` returns main text, preferring article containers.
- `computer(action, coordinate|ref, ...)` covers screenshot, click, type, key, scroll and zoom through CDP. `form_input(ref, value)`, `navigate(url|back|forward)`, `javascript_tool`, `read_console_messages`, `read_network_requests`, `upload_image`, `file_upload`, `resize_window`, `gif_creator`, `update_plan(domains, approach)`, and shortcuts.
- The extension hides its own overlay before screenshots and clicks (`HIDE_FOR_TOOL_USE`) ([lzwjava write-up](https://lzwjava.github.io/claude-chrome-extension-architecture-en), **unverified**).

**Primary-source confirmation:** Anthropic now ships the same design as a public client toolset, `browser_toolset_20260801` ([Browser use tool docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool)). It has 31 members (27 on by default): `navigate`, `screenshot`, `zoom`, the click family, `hover`, `scroll`/`scroll_to`, `type`, `key`, `read_page`, `find`, `get_page_text`, `form_input`, tab tools, and opt-in `javascript_exec` / `file_upload` / `read_console` / `read_network`. Key rules from that page:

- Targets are either `{"type":"ref","ref":"ref_2"}` (preferred) or `{"type":"coordinate","x":..,"y":..}` in **viewport pixels of the last screenshot**. Coordinates are for canvas, video and cross-origin iframes.
- Refs are scoped per tab and valid until navigation or a material DOM change. **The executor must detect stale refs and return an error telling the model to re-read. Never renumber refs that were already handed out.**
- `read_page` is capped at 50,000 characters and `find` returns at most 20 matches.
- Calls in one turn run in order. After the first failure, the rest return `Not executed: an earlier action in this turn failed.`
- Results may contain only text, image and `browser_state` blocks. The API does **not** downscale images.
- Anthropic runs injection classifiers on browser tool results server-side (opting out requires contacting support).

### Permission model (support article, read 2026-11-01)

From [Claude in Chrome permissions guide](https://support.claude.com/en/articles/12902446):

- **Modes:** *Manually approve* (formerly "Ask before acting") asks before each action. *Automatically approve* runs a safety check on each action, blocks unsafe ones and asks when needed (default in Cowork). *Skip all approvals* (formerly "Act without asking") applies no checks.
- **Per-site prompt:** "Allow this action" (the article calls it safest), "Always allow actions on this site", or "Decline". Some sites always show "New permissions required".
- **Always asks, even with "always allow":** downloading files, entering potentially sensitive information, granting authorizations, changing permission settings.
- **Prohibited in every mode:** purchases or financial transactions, creating accounts, handling credit card or ID data, downloading from untrusted sources, permanent deletions, investment advice or trades, modifying system files, **following instructions found in emails or web content**.
- **Management:** Settings > Permissions lists approved sites, revocation and permission history. Team and Enterprise admins get allowlists and blocklists that override users.
- **Blocked categories:** financial services, adult content, pirated content ([launch post](https://claude.com/blog/claude-for-chrome)).

### Prompt-injection defenses and numbers

| Source and date | Setup | Attack success rate (ASR) |
|---|---|---|
| [Launch post](https://claude.com/blog/claude-for-chrome), 2025-08-25 | 123 test cases, 29 attack scenarios | 23.6% without mitigations, **11.2%** with them (autonomous mode) |
| same | 4 browser-specific attack types (hidden DOM fields, URL/tab-title injection, etc.) | 35.7% to **0%** |
| [Prompt injection defenses](https://www.anthropic.com/research/prompt-injection-defenses), 2025-11-24 | Adaptive best-of-N attacker, 100 tries per environment, about 2.2k–3.2k attempts per bar | Model only / old safeguards / improved: Sonnet 4.5 13.8 / 10.8 / **1.9%**; Haiku 4.5 12.0 / 11.1 / **2.4%**; Opus 4.5 8.0 / 7.6 / **1.4%** |
| [GA post](https://claude.com/blog/claude-in-chrome-generally-available), 2026-08-26 | New professional red-team evaluation (the old one is retired as saturated) | Before safeguards: Opus 4.5 17.6%, Opus 5 3.8%. Opus 4.5 with probes: 16.7%. With probes plus the action classifier: **0%** for Sonnet 5, Opus 5, Mythos 5, and 0.3% for Fable 5. All successful breaks were low severity. |

Defense mechanisms named by Anthropic:

1. RL training on simulated injected web content.
2. Classifiers ("probes") that scan **all untrusted content entering the context**, including hidden text, manipulated images and deceptive UI. When one fires, the model gets a warning to treat the content with suspicion.
3. An **action classifier** that checks each action against the user's original request (the Automatically approve mode).
4. Site permissions, confirmation for high-risk actions, and blocked categories.
5. Continuous internal red-teaming plus external arena challenges.

A secondary report claims a 31.5% raw ASR for Opus 4.8 that falls to 0.5% with safeguards ([pulse.bot](https://www.pulse.bot/ai/news/anthropics-browser-agent-got-hijacked-315-of-the-time-before-safeguards-engaged-08ce0929-21bd-42f1-ab59-1f78400b4f7f/)). **Unverified** against the primary system card.

**Effect on Toolbelt:** Anthropic's server-side classifiers protect requests to Anthropic only. For Grok, OpenAI and Gemini, Toolbelt gets none of this. Its own approval gate and blocklist are the only guaranteed layers.

### Google Chrome's agent (Gemini in Chrome)

[Architecting Security for Agentic Capabilities in Chrome](https://blog.google/security/architecting-security-for-agentic/), Nathan Parker, 2025-12-08:

- **User Alignment Critic:** a separate Gemini model that sees **only the metadata of proposed actions**, never the untrusted page. It vetoes actions that don't serve the user's goal (a dual-LLM / CaMeL-style pattern).
- **Agent Origin Sets:** each task has a read-only origin set and a read-write origin set, which limits cross-origin exfiltration.
- Sign-in through Google Password Manager needs confirmation, and the model never sees passwords. User confirmation is required for critical steps, plus real-time threat detection and VRP bounties up to $20k.

### Open-source agents and their page representations

| Project | Form | Page representation | Source |
|---|---|---|---|
| **browser-use** (Python, MIT, v0.13.14, 2026-10-26) | Library over CDP or Playwright | Merges CDP `DOM.getDocument` + `DOMSnapshot.captureSnapshot` + `Accessibility.getFullAXTree` per frame. It keeps visible, interactive, scrollable elements and shadow hosts, and serializes lines like `[index]<tag attrs>text` indented by depth. Elements new since the last step get a `*` prefix. Iframes are marked `\|IFRAME\|` and shadow roots `Open Shadow`/`Closed Shadow`, with a hint like "N more elements below, scroll to reveal". Indices are tied to CDP `backend_node_id`. | [browser_use/dom/service.py](https://github.com/browser-use/browser-use/blob/main/browser_use/dom/service.py), [serializer.py](https://github.com/browser-use/browser-use/blob/main/browser_use/dom/serializer/serializer.py) |
| **nanobrowser** (Chrome extension, Apache-2.0, v0.3.0, 2026-10-15) | Side-panel agent with bring-your-own keys for Anthropic, OpenAI, Gemini, **xAI Grok**, OpenRouter, Ollama | `chrome.debugger`: `Accessibility.getFullAXTree` **per frame** (at most 20 frames, depth 5, ad frames skipped), with `DOMSnapshot` layout as tier 2. Refs are bound to *(tab, CDP session, frameId, loaderId, backendNodeId)* plus a fingerprint (role, name, nth, enclosing-row digest). Each ref is revalidated before use and reports its stale reason (`document`, `frame-detached`, `debugger-detached`). It has modules for masking sensitive field values, an action **gate/classify**, a navigation guard and URL policy. Keys stay in the browser. | [repo](https://github.com/nanobrowser/nanobrowser), `src/browser-control/core/refs.ts`, `core/perception/capture.ts` |

nanobrowser is the closest analogue to Toolbelt (MV3, side panel, the same four providers). Read its `core/interaction/gate.ts`, `perception/masking.ts` and `refs.ts` before building.

## Open questions

- Anthropic has not published the extension's source or how it handles Firefox (it is Chrome-only).
- The exact rules the action classifier uses are not public.
