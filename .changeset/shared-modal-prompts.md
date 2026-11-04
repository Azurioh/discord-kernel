---
"@azurioh/discord-kernel": minor
---

Add `promptModal`, `PromptableModal`, `ModalPromptResult`, and the five-minute
`MODAL_PROMPT_TIMEOUT_MS` default at `discord/interaction/prompt-modal`, plus
`ModalPromptError` at `discord/interaction/prompt-modal-errors`. Modal prompts
isolate concurrent openings and members, return dismissed on collector timeout,
and propagate other errors.

The settings editor now uses the shared prompt and logs modal show/collect
failures with the field or group key instead of silently swallowing them.
Members still see the unchanged screen on failure; timeouts remain unlogged.
