---
"@azurioh/discord-kernel": major
---

Every reply path now sends a `View`, in either layout: a bot answers in V1 or
Components V2 with the same call, and a V2 `Presenter` turns every kernel reply
(failures, guard denials, disabled or unavailable modules, the "restarting"
answer) into Components V2. The default presenter's embeds are unchanged.

## Breaking change: migration

| Symbol | Old import | New import |
|---|---|---|
| `sendEmbed(interaction, embed, ephemeral, logger)` | `@azurioh/discord-kernel/discord/command/send-embed` | `sendView(interaction, view, { ephemeral }, logger)` at `@azurioh/discord-kernel/discord/command/send-view` |
| `moduleDisabledEmbed` (returned an `EmbedBuilder`) | not public | `moduleDisabledView` at `@azurioh/discord-kernel/discord/settings/module-disabled-view`, returns a `View` |
| `moduleUnavailableEmbed` (returned an `EmbedBuilder`) | `@azurioh/discord-kernel/discord/settings/module-unavailable-embed` | `moduleUnavailableView` at `@azurioh/discord-kernel/discord/settings/module-unavailable-view`, returns a `View` |
| `Presenter` methods (returned an `EmbedBuilder`) | `@azurioh/discord-kernel/discord/presenter` | same import; each method returns a `View`: wrap a returned embed as `{ embeds: [embed] }` |
| `createDefaultPresenter` | `@azurioh/discord-kernel/discord/default-presenter` | same import; returns `{ embeds: [embed] }`, the embed identical to 2.x |
| `Context.reply(embed)` | `@azurioh/discord-kernel/discord/command/context` | same import; `reply(view)`: rewrite `ctx.reply(embed)` as `ctx.reply({ embeds: [embed] })` |

Also note: guard denials, the unknown-subcommand answer and component denials
now go through `sendView` like every other kernel reply, so a failed delivery is
logged instead of rejecting, and a view over a Discord limit throws
`ViewLimitError` before anything is sent.
