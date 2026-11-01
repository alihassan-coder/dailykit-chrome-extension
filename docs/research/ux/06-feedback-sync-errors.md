# 06 · Feedback, sync and error states

Question: how to handle offline, sync conflict, migration running and database unreachable; when to use toasts vs inline status; and undo vs confirm.

Researched 2026-10-31.

## TL;DR

- Local-first means **the UI never waits on Neon**. Writes land locally first, and sync is a background status, not a gate. Offline is a quiet status, not an error.
- Use the NN/g taxonomy:
  - **Indicators**: contextual and passive, used for sync state.
  - **Validations**: tied to an input.
  - **Notifications**: passive toast, or action-required only when the user truly must act.
- A toast (snackbar) is for **confirming something the user just did, with one action (Undo)**. Never use one for a persistent state or for critical info.
- **Undo over confirm.** Confirm only for irreversible, high-severity actions, and make the confirm name the consequence.
- Timing (NN/g): under 1 s needs no spinner, 2 to 10 s gets a spinner, over 10 s gets percent-done plus a way to cancel.

## Findings

- **Indicators** are "contextual", "conditional" and "passive". **Notifications** are either action-required (intrusive, modal) or passive (badge, toast), and passive ones "are easy to miss if the information is key". [NN/g Indicators, validations, notifications](https://www.nngroup.com/articles/indicators-validations-notifications/)
- Confirmations: routine dialogs train people to click through ("will stop paying attention to the question"). "Do go to great lengths to provide undo." Keep confirmations for serious, irreversible actions, and make them specific. [NN/g Confirmation dialogs](https://www.nngroup.com/articles/confirmation-dialog/)
- Snackbars: show one at a time, with a single action, for about 4 to 10 s, and not for critical information. [Material 2 Snackbars](https://m2.material.io/components/snackbars)
- Response limits: 0.1 s feels instant; 1 s keeps flow, and above it show busy feedback; at 10 s, show percent-done and "a clearly signposted way for the user to interrupt the operation". [NN/g Response times](https://www.nngroup.com/articles/response-times-3-important-limits/)
- Spinners suit 2 to 10 s. Under 1 s they are distracting. Percent-done suits 10 s and over, or record series such as "Updating address 3 of 50". [NN/g Progress indicators](https://www.nngroup.com/articles/progress-indicators/)
- Local-first ([Ink & Switch](https://www.inkandswitch.com/essay/local-first/)):
  - "No spinners".
  - "The network is optional".
  - Offline apps that keep working normally build confidence. Blocking edits, as Google Docs does when offline, does not.
  - Conflicts are rare in practice. Dropbox-style "conflicted copy" files leave the user to resolve things alone.
  - Version history helps people understand changes.

## Recommendations for DailyKit

### The status model (one source of truth)

1. The core exposes one `syncStatus` per tool and one overall:

| State | Where shown | Words (exact style) |
|---|---|---|
| Local only (sync off) | Data & sync page, item chips | "This device" |
| Synced | Dashboard header indicator, chip | "Synced · 2 min ago" |
| Syncing | Same indicator, no spinner under 1 s | "Syncing 12 changes…" |
| Offline | Indicator only (neutral colour) | "Offline · changes are kept and will sync" |
| DB unreachable or auth failed | Indicator in warning colour + a card on Data & sync | "Can't reach your database since 10:42. Your data is safe on this device. [Retry] [Details]" |
| Conflict | Card on the affected item + a count on Data & sync | "2 items changed on two devices. [Review]" |
| Migration running | Blocking only for that tool's data, percent-done if over 10 s | "Updating Cairn's data to v4 · 3 of 5" |
| Migration failed | Action-required card | "Cairn's data update stopped at step 3. Nothing was lost; Cairn is using v3. [Retry] [Export backup]" |

2. **Indicators, not toasts, carry state.** The header of the side panel and dashboard shows a small dot plus a short text label for sync. A toast is never the only place a state appears.
3. **Offline is neutral grey, not red.** Nothing is disabled offline except actions that truly need the network, such as "Sync now" and the Neon connection test. Those stay visible, with "Needs a connection" as helper text.
4. **DB unreachable**: retry with backoff in the background worker. Escalate from the passive indicator to the card only after the third failed attempt or 5 minutes. Never show a modal.
5. **Conflicts**: most can be settled automatically by last-writer-wins per *field*, plus a merged union for tags. Only conflicts within the same field reach the user. The review screen shows both versions side by side, with "Keep this device / Keep other / Keep both". Keep the losing version in history for 30 days, so the choice is reversible.
6. **Migrations**:
   - Run them in the background worker at update time, *before* the tool mounts.
   - Take an automatic local backup first, and say so ("Backup saved first").
   - The dashboard shows "Database up to date · v3" (as in the blueprint).
   - While a migration runs, the tool's panel shows the progress line, and the other tools stay usable.
   - A failure rolls back and keeps the old version working.

### Toasts

7. One toast at a time, shown at the bottom of the panel or page. It holds **one sentence and at most one action**, and auto-dismisses after **6 s**. It stays while hovered or focused, and **Undo stays reachable for 10 s**. It is announced through `aria-live="polite"`.
8. Use a toast for: saved, deleted (with Undo), moved, copied ("Copied · 1,240 tokens"), and tool turned off (with Undo). Don't use one for errors that need action, or for persistent states.

### Undo over confirm

9. **Undoable, no confirm:** delete a chat, tag or snippet, turn off a tool or feature, reset settings, hide on site, and reorder. Implement these as soft-delete with a 10 s undo window, plus a "Recently deleted" area kept for 30 days in each tool's data.
10. **Confirm (specific, typed or named button):** "Delete all saved data", disconnecting sync *and* deleting remote data, and restoring a backup over current data. The button names the action ("Delete 1,284 chats"), never "OK" or "Yes". A full wipe requires typing the tool name.
11. **Inline errors** for form fields such as the Neon connection string: show them next to the field, say what is wrong and how to fix it ("This looks like a pooled URL; use the direct connection string"), and keep the user's input.

### Speed perception

12. Local reads render in the first frame, with no skeleton. Show a skeleton only for network-bound panes, and only after 300 ms. Start a spinner only past 1 s. Past 10 s, show percent-done with Cancel.
