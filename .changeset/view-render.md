---
"@azurioh/discord-kernel": minor
---

Add `View`, one data type for a message in either layout: a V1 view (`content`,
`embeds`, `rows`) or a Components V2 view (`components`: `text`, `container`,
`section`, `separator`, `gallery`, `file`, `buttons`, `select` nodes), at
`discord/view/view`. `renderView` at `discord/view/render-view` validates a view,
compiles it to discord.js builders and sets its flags (`IsComponentsV2`,
`Ephemeral`), returning `RenderedMessage` (any send kind) or `RenderedReply`
(when `ephemeral` may be set: reply and follow-up only).

Limits live at `discord/view/view-limits` (`MAX_V2_COMPONENTS`,
`MAX_V2_TEXT_CHARACTERS`, `MAX_SECTION_TEXTS`, `MAX_GALLERY_ITEMS`,
`MAX_MEDIA_DESCRIPTION`, `MAX_ROW_BUTTONS`, `MAX_MESSAGE_ROWS`,
`MAX_MESSAGE_EMBEDS`) and the errors renderView throws before any builder runs
at `discord/view/view-errors` (`ViewLimitError`, `MissingAttachmentError`,
`EmptyViewError`, `ViewLayoutSwitchError`).

`AnySelectMenu` is added to `discord/interaction/select-menu`; `CardSelectMenu`
in `discord/ui/card` is now an alias of it.
