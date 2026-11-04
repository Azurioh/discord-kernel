# Research: One View for Components V1 and V2

Decisions taken while planning `specs/003-view-rendering`. Each entry: decision, rationale,
alternatives considered. Discord facts are cited from `discord-api-types` 0.38.53
(`payloads/v10/message.d.ts`), `@discordjs/builders` 1.14.1 and `discord.js` 14.27.0 as installed,
plus the Discord message resource docs and the discord.js guide ("Display components").

## R1. Discord facts the design relies on

| Fact | Source | Confirmed |
|---|---|---|
| `IsComponentsV2 = 32768`; a V2 message carries no `content`, `embeds`, `poll`, `sticker_ids` | `message.d.ts:438`; Discord message resource | yes |
| The flag can only be set, never cleared: a V2 message cannot be edited back to V1 | Discord message resource (edit) | yes |
| At most 40 components per message, nested ones counted | discord.js guide | guide only |
| At most 4000 characters across all text displays | discord.js guide | guide only |
| Section: 1 to 3 text displays and **one required accessory**, button or thumbnail | `message.d.ts:1580,1586`; builder throws without accessory | yes |
| Media gallery: 1 to 10 items; item and thumbnail `description` ≤ 1024 | `message.d.ts:1652`; builders | yes |
| File: references `attachment://<name>` only, one attachment per file component, `spoiler` optional, no description | `message.d.ts:180,1667` | yes |
| Separator spacing `Small = 1`, `Large = 2`; `divider` defaults to true | `message.d.ts:1688-1690` | yes |
| Container: accent `0x000000`–`0xFFFFFF`, `spoiler`; children: action row, text, section, gallery, separator, file | `message.d.ts`; builders | yes |
| Container holds at most 10 children | `message.d.ts:1714` doc comment only; builders do not check | **no** |
| Action row: 5 buttons, or one select and nothing else | `message.d.ts:1339`; components reference | yes |
| Ephemeral (64) combines with V2 | not documented | **no** |
| Flag needed on `editReply` / `followUp` / `update` of a V2 message | guide: not needed when deferring; otherwise silent | **no** |
| Builders validate only in `toJSON()`, with shapeshift `ValidationError`; Container does not check its child count | `@discordjs/builders/dist/index.js` | yes |

Unconfirmed facts are handled by R6 (the flag is stated on every V2 payload, which is harmless
since it can only be set) and by the hand check in [quickstart.md](./quickstart.md) §3 (ephemeral
V2, container with more than 10 children). The 10-children cap is **not** enforced: a limit the
kernel cannot cite would be invented; if the hand check shows Discord rejects it, the cap is added
as a constant in the same PR.

## R2. Shape of `View` (FR-001, FR-002)

**Decision**: one exported type `View<S = never>`, a union of two object shapes that each forbid
the other's fields with `?: never`:

- `V1View<S>`: `content?`, `embeds?: readonly EmbedBuilder[]`, `rows?: readonly (ViewRow<S> |
  null)[]`, `components?: never`.
- `V2View<S>`: `components: readonly (V2Component<S> | null)[]`, `content?: never`,
  `embeds?: never`, `rows?: never`.
- Both: `files?: MessageFile[]` and `allowedMentions?` (the existing base of
  `InteractiveMessagePayload`, moved, same semantics: leaving `files` out leaves attachments
  alone).

No discriminant field (`layout`): the presence of `components` is the discriminant, and `?: never`
makes a mix a compile error (SC-002). `S` defaults to `never` so a view without stateful controls
(a presenter reply) needs no type argument.

**Rationale**: the existing `InteractiveMessagePayload` already proved the `?: never` pattern
(`interactive-message-payload.ts:53`), but needed `layout: "card"` because both arms had a
`components` key. With rows renamed `rows` on V1, the key itself discriminates and authors write
less.

**Alternatives considered**:
- A `layout: "v1" | "v2"` tag: redundant with the key; one more thing to get wrong. Rejected.
- Two separate types with no union: every send path would need two overloads. Rejected.

## R3. V2 components as tagged data (FR-003 to FR-006)

**Decision**: `V2Component<S>` is a union of plain objects tagged by `type`:

| `type` | Fields | Notes |
|---|---|---|
| `text` | `content` | |
| `container` | `accent?: number`, `spoiler?`, `children: readonly (ContainerChild<S> \| null)[]` | `ContainerChild` = every component except `container` (no nesting, by type) |
| `section` | `texts: [string] \| [string, string] \| [string, string, string]`, `accessory: { button: Button<S> } \| { thumbnail: MediaItem }` | 1–3 texts enforced by the tuple type; accessory required (R1) |
| `separator` | `spacing?: "small" \| "large"`, `divider?` | |
| `gallery` | `items: readonly MediaItem[]` | 1–10, checked at render |
| `file` | `name`, `spoiler?` | `name` must match a `files` entry (FR-010) |
| `buttons` | `buttons: readonly Button<S>[]` | 1–5, checked at render |
| `select` | `menu: AnySelectMenu` | one select per row |

`MediaItem` = `{ url, description?, spoiler? }` (today's `CardImage`, renamed). `AnySelectMenu` is
today's `CardSelectMenu` (`{ id; apply(forceDisabled?) }`), moved next to `SelectMenu` in
`@/discord/interaction/select-menu` since every compiled select already satisfies it.

The `buttons` and `select` nodes are also the V1 `rows` (`ViewRow<S>`): one row vocabulary for
both layouts, replacing the pre-built `ActionRowBuilder[]` V1 views pass today.

**Rationale**: matches the user's choice (data, like card blocks) and constitution III. The
section tuple and the container-child type move two Discord rules from runtime to compile time.

**Alternatives considered**:
- Keep `entry { title, lines, action? | thumbnail? }`: it hides two different components
  (section, or plain text when there is no accessory) behind one name, and fixes the bold-title
  formatting in the kernel. Rejected; the migration note maps `entry` to `section` or `text`.
- Accept `ActionRowBuilder` in `rows` as well: two ways to write a row. Rejected.

## R4. One render point (FR-007)

**Decision**: `renderView(view, options)` in `@/discord/view/render-view.ts` turns a view into a
`RenderedMessage` (the discord.js options object for reply, edit, follow-up and update) and is the
only file that names `MessageFlags.IsComponentsV2`. Options: `state` (required when the view type
has a non-`never` `S`), `disabled?` (force every control disabled, the "ended" render),
`ephemeral?`, `attachments?` (the message's current attachments, as `toMessageEditOptions` takes
today). It validates (R5), then compiles nodes with the discord.js builders.

`toMessageEditOptions` is folded into `renderView` (it already did the payload→options step for
interactive messages); its subpath is removed.

A test enforces SC-003: it scans `packages/kernel/src` and fails if `IsComponentsV2` appears in
any file other than `render-view.ts` (next to `tests/constitution/runtime-dependencies.test.ts`).

**Alternatives considered**: let each send path set the flag: the cause of today's split.
Rejected.

## R5. Limits and errors (FR-009, FR-010)

**Decision**: constants in `@/discord/view/view-limits.ts`: `MAX_V2_COMPONENTS = 40`,
`MAX_V2_TEXT_CHARACTERS = 4000`, `MAX_SECTION_TEXTS = 3`, `MAX_GALLERY_ITEMS = 10`,
`MAX_MEDIA_DESCRIPTION = 1024`, `MAX_ROW_BUTTONS = 5`, `MAX_MESSAGE_ROWS = 5`,
`MAX_MESSAGE_EMBEDS = 10`. `MAX_CARD_COMPONENTS` and `MAX_CARD_TEXT_CHARACTERS` are removed
(replaced by the first two). Embed field and total limits stay in `@/discord/ui/embed`.

Errors in `@/discord/view/view-errors.ts`: `ViewLimitError` (`limit`, `actual`, `max`),
`MissingAttachmentError` (`name`), `EmptyViewError`, `ViewLayoutSwitchError` (R7). They replace
the bare `Error` `card.ts:193` throws today. Validation runs before any builder is created, so a
module author never sees a shapeshift error from discord.js for a limit the kernel knows.

Text over a limit is refused, not cut: cutting is the author's explicit choice through
`truncateText`.

## R6. The flag on every send kind (FR-008, FR-012)

**Decision**: `renderView` sets `IsComponentsV2` on every V2 payload, whatever the send kind
(reply, edit of a deferred answer, follow-up, component update), combined with `Ephemeral` when
asked. V1 payloads carry no V2 flag. Edits pass `content: null`-style resets only where discord.js
requires them (checked by the send-view tests against recorded payloads).

**Rationale**: the flag can only be set, never cleared (R1), so stating it on an edit of a V2
message is harmless, and stating it on the first edit of a deferred answer is required (deferring
cannot carry it). One rule, no per-path branch.

## R7. V2 → V1 switch (FR-011)

**Decision**: the interactive-message collector remembers the layout of its last render; a render
that goes from V2 to V1 throws `ViewLayoutSwitchError` before calling Discord. The paginator and
persistent paginator inherit it (they render through the collector or through `renderView` with
the previous layout passed in). Other send paths do not track layouts: Discord's rejection
propagates as an error and is logged by the existing error handling.

## R8. Send paths (FR-008, FR-013 to FR-016)

**Decision**:

- `sendEmbed(interaction, embed, ephemeral, logger)` becomes `sendView(interaction, view,
  { ephemeral }, logger)` in `@/discord/command/send-view.ts`; `send-embed.ts` is deleted (same
  three branches: reply, editReply, followUp).
- `Context.reply(view: View)`; the command responders (`confirm`, `error`, `deny`) send the
  presenter's view.
- `Presenter` methods return `View` (`View<never>`); `createDefaultPresenter` returns
  `{ embeds: [buildEmbed(...).setColor(...)] }`, identical embeds (FR-015, tested by comparing
  `toJSON()` with 2.x output).
- `moduleDisabledEmbed` / `moduleUnavailableEmbed` become `moduleDisabledView` /
  `moduleUnavailableView`, built through the presenter (`denial` / `warning`) so a V2 presenter
  covers them (FR-016). Files renamed accordingly.
- `passesGuard`, `component-router`, `lifecycle-dispatcher` send through `sendView`.
- `InteractiveView<S>.render(state): View<S>`; `disabledControls` is removed: the "ended" render
  is `renderView(view.render(state), { disabled: true })`, which disables every button and select
  in both layouts (today's `apply(state, true)` path, generalised).
- `PaginatorRender<T>` returns `View<PageState>`; the paginator appends its navigation row (V1:
  a row; V2: a `buttons` node at the end of `components`). `PersistentPage` becomes
  `{ view: View<PageState>; pageCount }`.
- `InteractiveMessagePayload`, `DisabledInteractiveMessageComponents` and `PaginatorPayload` are
  removed (replaced by `View`).

## R9. Settings editor (FR-018)

**Decision**: `settings-editor-card.view.ts` builds a `container` node instead of
`createCard(...)`: `entry` with action → `section` with `{ button }` accessory and
`texts: ["**title**\nlines"]`; `entry` without action → `text` with the same string; `text`,
`separator`, `controls` → `text`, `separator`, `buttons`. Its outer row moves into the same
`components` list. `settings-editor.view.ts` (V1) moves its pre-built rows to `buttons` / `select`
row nodes. The existing settings-editor tests keep every assertion (SC-006); helpers narrowing
`InteractiveMessagePayload` move to one shared test helper in `tests/support/`.

## R10. Release and migration note (FR-019)

**Decision**: one changeset, major (3.0.0), written with the last PR. It follows the 2.0.0 format
(`packages/kernel/CHANGELOG.md`, "Breaking change: migration" table) and lists: removed subpaths
(`./discord/ui/card`, `./discord/command/send-embed`,
`./discord/components/interactive-message/interactive-message-payload`,
`…/message-edit-options`), renamed symbols (`sendEmbed` → `sendView`, `moduleDisabledEmbed` →
`moduleDisabledView`, `moduleUnavailableEmbed` → `moduleUnavailableView`), changed signatures
(`Presenter`, `Context.reply`, `PaginatorRender`, `PersistentPage`, `InteractiveView`), and the
card block → container child table.

## R11. Test support

**Decision**: `tests/support/bot-interaction.ts` gains `deferReply`, `editReply`, `followUp` and
`update` spies and a `sentPayloads()` accessor, so send-path tests assert on recorded payloads
instead of each test building its own fixture (`send-embed.test.ts` has one today; it is replaced).
Compile-time tests use Vitest `expectTypeOf` plus `@ts-expect-error` lines in a regular test file: `packages/kernel/tsconfig.json`
includes `tests/`, so an unused `@ts-expect-error` fails `pnpm typecheck`.

## R12. Sandbox demo (FR-020)

**Decision**: a `view-demo` command in the sandbox's demo module
(`apps/sandbox-bot/src/modules/demo/commands/view-demo/`) with two subcommands: `message` (text
above two containers, a section with a button, a section with a thumbnail, a gallery, a file
generated in memory) and `pages` (a V2 paginator over a fixed list). Imports only public subpaths.
Checked by hand on Discord (quickstart §3).
