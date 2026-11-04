# Contract: Public API changed by spec 003 (release 3.0.0)

Every addition gets an explicit `package.json` subpath (no wildcard). Every removal and rename is
listed in the 3.0.0 changeset with its replacement (constitution VIII). Shapes: see
[data-model.md](../data-model.md).

## Added

### `@azurioh/discord-kernel/discord/view/view`

```ts
export type View<S = never> = V1View<S> | V2View<S>;
export interface V1View<S = never> { /* content?, embeds?, rows?, files?, allowedMentions?, components?: never */ }
export interface V2View<S = never> { /* components, files?, allowedMentions?, content?/embeds?/rows?: never */ }
export type V2Component<S = never> = ContainerNode<S> | ContainerChild<S>;
export type ContainerChild<S = never> = TextNode | SectionNode<S> | SeparatorNode | GalleryNode | FileNode | ViewRow<S>;
export type ViewRow<S = never> = ButtonsRow<S> | SelectRow;
export interface TextNode { readonly type: "text"; readonly content: string }
export interface ContainerNode<S = never> { readonly type: "container"; readonly accent?: number; readonly spoiler?: boolean; readonly children: readonly (ContainerChild<S> | null)[] }
export interface SectionNode<S = never> { readonly type: "section"; readonly texts: readonly [string] | readonly [string, string] | readonly [string, string, string]; readonly accessory: { readonly button: Button<S> } | { readonly thumbnail: MediaItem } }
export interface SeparatorNode { readonly type: "separator"; readonly spacing?: "small" | "large"; readonly divider?: boolean }
export interface GalleryNode { readonly type: "gallery"; readonly items: readonly MediaItem[] }
export interface FileNode { readonly type: "file"; readonly name: string; readonly spoiler?: boolean }
export interface ButtonsRow<S = never> { readonly type: "buttons"; readonly buttons: readonly Button<S>[] }
export interface SelectRow { readonly type: "select"; readonly menu: AnySelectMenu }
export interface MediaItem { readonly url: string; readonly description?: string; readonly spoiler?: boolean }
```

### `@azurioh/discord-kernel/discord/view/render-view`

```ts
export type RenderOptions<S> = ([S] extends [never] ? { readonly state?: never } : { readonly state: S }) & {
  readonly disabled?: boolean;
  readonly ephemeral?: boolean;
  readonly attachments?: readonly Attachment[];
  readonly previous?: "v1" | "v2";
};
export type RenderedMessage = InteractionReplyOptions & InteractionUpdateOptions; // exact shape fixed in PR 1
export function renderView<S>(view: View<S>, options: RenderOptions<S>): RenderedMessage;
```

The only kernel source file that names `MessageFlags.IsComponentsV2`.

### `@azurioh/discord-kernel/discord/view/view-limits`

```ts
export const MAX_V2_COMPONENTS = 40;
export const MAX_V2_TEXT_CHARACTERS = 4000;
export const MAX_SECTION_TEXTS = 3;
export const MAX_GALLERY_ITEMS = 10;
export const MAX_MEDIA_DESCRIPTION = 1024;
export const MAX_ROW_BUTTONS = 5;
export const MAX_MESSAGE_ROWS = 5;
export const MAX_MESSAGE_EMBEDS = 10;
```

### `@azurioh/discord-kernel/discord/view/view-errors`

```ts
export class ViewLimitError extends Error { readonly limit: string; readonly actual: number; readonly max: number }
export class MissingAttachmentError extends Error { readonly name: string }
export class EmptyViewError extends Error { readonly layout: "v1" | "v2" }
export class ViewLayoutSwitchError extends Error {}
```

### `@azurioh/discord-kernel/discord/command/send-view`

```ts
export function sendView(
  interaction: RepliableInteraction,
  view: View,
  options: { readonly ephemeral: boolean },
  logger: Logger,
): Promise<void>;
```

### `@azurioh/discord-kernel/discord/settings/module-disabled-view`, `…/module-unavailable-view`

```ts
export function moduleDisabledView(interaction, deps): Promise<View>;     // same deps as 2.x
export function moduleUnavailableView(interaction, deps): Promise<View>;  // same deps as 2.x
```

### `@azurioh/discord-kernel/discord/interaction/select-menu` (addition to an existing subpath)

```ts
export interface AnySelectMenu { readonly id: string; apply(forceDisabled?: boolean): AnySelectMenuBuilder }
```

## Changed

| Subpath | Symbol | 2.x | 3.0 |
|---|---|---|---|
| `./discord/presenter` | `Presenter` | methods return `EmbedBuilder` | methods return `View` |
| `./discord/default-presenter` | `createDefaultPresenter` | embeds | `{ embeds: [same embed] }` |
| `./discord/command/context` | `Context.reply` | `(embed: EmbedBuilder)` | `(view: View)` |
| `./discord/components/interactive-message/interactive-message-collector` | `InteractiveView<S>` | `render → InteractiveMessagePayload<S>`, `disabledControls(state)` | `render → View<S>`; ended render = `renderView(…, { disabled: true })` |
| `./discord/components/paginator/paginator-view` | `PaginatorRender<T>` | `→ EmbedBuilder` | `→ View<PageState>` |
| `./discord/components/persistent-paginator` | `PersistentPage` | `{ embed; pageCount }` | `{ view; pageCount }` |
| `./discord/components/settings-editor/settings-editor-card.view` | `createCardEditorView` | renders a card | renders a `container` node; same signature |

## Removed

| Subpath / symbol | Replacement |
|---|---|
| `./discord/ui/card`: `createCard`, `Card`, `CardDef`, `CardBlock`, `CardImage`, `MAX_CARD_COMPONENTS`, `MAX_CARD_TEXT_CHARACTERS` | `container` node in `./discord/view/view`; `MediaItem`; `MAX_V2_COMPONENTS`, `MAX_V2_TEXT_CHARACTERS` |
| `CardSelectMenu` | `AnySelectMenu` (`./discord/interaction/select-menu`) |
| `./discord/command/send-embed`: `sendEmbed` | `sendView` |
| `./discord/settings/module-unavailable-embed`: `moduleUnavailableEmbed` | `moduleUnavailableView` |
| `./discord/settings/module-disabled-embed`: `moduleDisabledEmbed` | `moduleDisabledView` |
| `./discord/components/interactive-message/interactive-message-payload`: `InteractiveMessagePayload` | `View` |
| `DisabledInteractiveMessageComponents` | `renderView(…, { disabled: true })` |
| `./discord/components/interactive-message/message-edit-options`: `toMessageEditOptions` | `renderView` |
| `PaginatorPayload` | `View<PageState>` |

Folder `index.ts` entry points (`components/interactive-message/index.ts`,
`components/paginator/index.ts`) drop the removed re-exports and re-export `View` where they
re-exported the payload type.

## Card block → container child

| 2.x card block | 3.0 container child |
|---|---|
| `{ kind: "text", content }` | `{ type: "text", content }` |
| `{ kind: "entry", title, lines, action }` | `{ type: "section", texts: [\`**${title}**\n${lines.join("\n")}\`], accessory: { button: action } }` |
| `{ kind: "entry", title, lines, thumbnail }` | `{ type: "section", texts: [...], accessory: { thumbnail: { url: thumbnail } } }` |
| `{ kind: "entry", title, lines }` (no accessory) | `{ type: "text", content: \`**${title}**\n…\` }` |
| `{ kind: "controls", buttons }` | `{ type: "buttons", buttons }` |
| `{ kind: "select", menu }` | `{ type: "select", menu }` |
| `{ kind: "separator", spacing, divider }` | `{ type: "separator", spacing, divider }` |
| `{ kind: "gallery", images }` | `{ type: "gallery", items: images }` |
| `createCard({ accent, blocks })` sent with `layout: "card"` | `{ components: [{ type: "container", accent, children }] }` |

Field names checked against `packages/kernel/src/discord/ui/card.ts` (2.0.0): blocks are tagged
by `kind`, `entry.lines` is optional, `entry.thumbnail` is a URL string, `gallery.images` holds
`CardImage` (same fields as `MediaItem`).
