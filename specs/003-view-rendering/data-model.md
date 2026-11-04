# Data Model: One View for Components V1 and V2

Types only; nothing is persisted. Decisions behind each shape: [research.md](./research.md).

## View

```text
View<S = never> = V1View<S> | V2View<S>

ViewBase
  files?: MessageFile[]            # whole set; left out = keep the message's attachments
  allowedMentions?: MessageMentionOptions

V1View<S> extends ViewBase
  content?: string
  embeds?: readonly EmbedBuilder[]           # ≤ MAX_MESSAGE_EMBEDS
  rows?: readonly (ViewRow<S> | null)[]      # ≤ MAX_MESSAGE_ROWS after nulls are skipped
  components?: never

V2View<S> extends ViewBase
  components: readonly (V2Component<S> | null)[]   # ≥ 1 after nulls are skipped
  content?: never
  embeds?: never
  rows?: never
```

Validation (at render, before any builder):

| Rule | Error |
|---|---|
| V1 with no content, no embed, no row; V2 with no component | `EmptyViewError` |
| More than `MAX_MESSAGE_EMBEDS` embeds or `MAX_MESSAGE_ROWS` rows (V1) | `ViewLimitError` |
| More than `MAX_V2_COMPONENTS` components, nested ones counted (V2) | `ViewLimitError` |
| More than `MAX_V2_TEXT_CHARACTERS` across `text` contents and `section` texts (V2) | `ViewLimitError` |
| A `file` whose `name` is not in `files` (or, when `files` is left out, not in the message's current attachments) | `MissingAttachmentError` |

## V2 components

```text
V2Component<S> = ContainerNode<S> | ContainerChild<S>

ContainerChild<S> = TextNode | SectionNode<S> | SeparatorNode | GalleryNode | FileNode | ViewRow<S>

TextNode          { type: "text"; content: string }
ContainerNode<S>  { type: "container"; accent?: number; spoiler?: boolean;
                    children: readonly (ContainerChild<S> | null)[] }   # ≥ 1 after nulls
SectionNode<S>    { type: "section";
                    texts: [string] | [string, string] | [string, string, string];
                    accessory: { button: Button<S> } | { thumbnail: MediaItem } }
SeparatorNode     { type: "separator"; spacing?: "small" | "large"; divider?: boolean }
GalleryNode       { type: "gallery"; items: readonly MediaItem[] }      # 1..MAX_GALLERY_ITEMS
FileNode          { type: "file"; name: string; spoiler?: boolean }

ViewRow<S> = ButtonsRow<S> | SelectRow
ButtonsRow<S>     { type: "buttons"; buttons: readonly Button<S>[] }   # 1..MAX_ROW_BUTTONS
SelectRow         { type: "select"; menu: AnySelectMenu }

MediaItem         { url: string; description?: string; spoiler?: boolean }  # description ≤ MAX_MEDIA_DESCRIPTION
AnySelectMenu     { readonly id: string; apply(forceDisabled?: boolean): AnySelectMenuBuilder }
```

Compile-time rules: a container cannot hold a container (`ContainerChild` excludes it); a
section holds one to three texts (tuple) and exactly one accessory (union of two single-key
objects); V1 and V2 fields cannot meet (`?: never`).

`accent` is a number, as `createCard` takes today; colour names go through the existing
`@/color` resolution at the call site.

## Rendering

```text
renderView<S>(view: View<S>, options: RenderOptions<S>): RenderedMessage

RenderOptions<S>
  state: S                       # omitted when S = never
  disabled?: boolean             # every button and select rendered disabled
  ephemeral?: boolean
  attachments?: readonly Attachment[]   # current attachments, for edits and file checks
  previous?: "v1" | "v2"         # layout of the message being updated; "v2" + V1 view → ViewLayoutSwitchError

RenderedMessage                  # assignable to reply, editReply, followUp and update options
  content?, embeds?, components, files?, attachments?, allowedMentions?, flags?
```

Flags: V2 → `IsComponentsV2` (plus `Ephemeral` when asked), on every send kind. V1 → `Ephemeral`
only when asked.

Node → Discord component:

| Node | Builder |
|---|---|
| `text` | `TextDisplayBuilder` |
| `container` | `ContainerBuilder` (`setAccentColor`, `setSpoiler`, `add*Components` per child) |
| `section` | `SectionBuilder` + `TextDisplayBuilder` ×1–3 + `setButtonAccessory(button.apply(state, disabled))` or `setThumbnailAccessory(ThumbnailBuilder)` |
| `separator` | `SeparatorBuilder` (`SeparatorSpacingSize.Small` / `Large`, `setDivider`) |
| `gallery` | `MediaGalleryBuilder` + `MediaGalleryItemBuilder` per item |
| `file` | `FileBuilder` (`attachment://<name>`, `setSpoiler`) |
| `buttons` | `createActionRow(buttons, state, { disableAll: disabled })` (existing) |
| `select` | `ActionRowBuilder` + `menu.apply(disabled)` |

## Errors (`@/discord/view/view-errors`)

| Class | Fields | Thrown when |
|---|---|---|
| `ViewLimitError` | `limit` (constant name), `actual`, `max` | any limit above |
| `MissingAttachmentError` | `name` | a `file` names an absent attachment |
| `EmptyViewError` | `layout` | nothing to send |
| `ViewLayoutSwitchError` | — | an owned message would go from V2 to V1 |

## Changed kernel types

| Type | 2.x | 3.0 |
|---|---|---|
| `Presenter` methods | `→ EmbedBuilder` | `→ View` |
| `Context.reply` | `(embed: EmbedBuilder)` | `(view: View)` |
| `sendEmbed` | `(interaction, embed, ephemeral, logger)` | `sendView(interaction, view, { ephemeral }, logger)` |
| `InteractiveView<S>` | `render → InteractiveMessagePayload<S>`, `disabledControls` | `render → View<S>` |
| `PaginatorRender<T>` | `→ EmbedBuilder` | `→ View<PageState>` |
| `PersistentPage` | `{ embed; pageCount }` | `{ view; pageCount }` |
| `moduleDisabledEmbed`, `moduleUnavailableEmbed` | `→ EmbedBuilder` | `moduleDisabledView`, `moduleUnavailableView` `→ View` |
| `InteractiveMessagePayload`, `DisabledInteractiveMessageComponents`, `PaginatorPayload`, `toMessageEditOptions`, `createCard`, `Card`, `CardDef`, `CardBlock`, `CardImage`, `CardSelectMenu`, `MAX_CARD_*` | exported | removed (replacements in [contracts/public-api.md](./contracts/public-api.md)) |
