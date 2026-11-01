---
"@azurioh/discord-kernel": major
---

`InteractiveMessagePayload` moved to its own module, to break an import cycle between the interactive message collector and `toMessageEditOptions`.

## Breaking change: migration

| Symbol | Old import | New import |
|---|---|---|
| `InteractiveMessagePayload` (type) | `@azurioh/discord-kernel/discord/components/interactive-message/interactive-message-collector` | `@azurioh/discord-kernel/discord/components/interactive-message/interactive-message-payload` (still exported by `.../interactive-message`) |

The type itself is unchanged, so changing the import is the whole migration.
