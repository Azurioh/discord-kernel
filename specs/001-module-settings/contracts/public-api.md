# Contract: Public API (`@azurioh/discord-kernel/settings`)

Signatures are the contract; bodies are implementation. Names are final unless the plan review
changes them.

## Entry points

Only two public subpaths expose this feature; nothing is imported from deeper paths
(`@azurioh/discord-kernel/settings/fields`, `…/settings/in-memory/…` and the like are not part of
the contract):

- `@azurioh/discord-kernel/settings`: declaration, registry, service, ports, in-memory twins,
  value types, errors.
- `@azurioh/discord-kernel/settings/testing`: the store contract test.

## Declaration

```ts
export function defineSettings<const D extends SettingsDeclarationInput>(input: D): SettingsDeclaration<D>;

/**
 * P is "defined" when the field has a default, "optional" otherwise. It is
 * type-level only and drives SettingsValues.
 */
export type FieldPresence = "defined" | "optional";
export interface Field<T, P extends FieldPresence = FieldPresence> {
  readonly spec: FieldSpec;          // kind + kind-specific constraints
  readonly label?: string;           // required on a module's fields, not on a list item
  readonly description?: string;
  readonly placeholder?: string;
  readonly unit?: string;
  readonly required: boolean;
  readonly default?: T;
  readonly ui?: FieldUi<T>;
  readonly access?: unknown;
}

/** Each builder X is overloaded: `default` given → Field<T, "defined">; otherwise Field<T, "optional">. */
type FieldBuilder<T, X> = {
  (opts: X & FieldOptions<T> & { default: T }): Field<T, "defined">;
  (opts?: X & FieldOptions<T>): Field<T, "optional">;
};

export const field: {
  channel: FieldBuilder<string, { types?: readonly ChannelKind[] }>;
  role: FieldBuilder<string, unknown>;
  user: FieldBuilder<string, unknown>;
  color: FieldBuilder<string, unknown>;     // stored "#rrggbb"
  duration: FieldBuilder<number, { min?: number; max?: number }>; // stored whole seconds
  enum<const V extends string>(opts: { choices: readonly { value: V; label: string }[] } & FieldOptions<V> & { default: V }): Field<V, "defined">;
  enum<const V extends string>(opts: { choices: readonly { value: V; label: string }[] } & FieldOptions<V>): Field<V, "optional">;
  integer: FieldBuilder<number, { min?: number; max?: number; suggest?: Suggestions<number> }>;
  number: FieldBuilder<number, { min?: number; max?: number }>;
  text: FieldBuilder<string, { minLength?: number; maxLength?: number; suggest?: Suggestions<string> }>;
  boolean: FieldBuilder<boolean, unknown>;
  secret(opts?: Omit<FieldOptions<string>, "default" | "ui"> & { ui?: Omit<FieldUi, "examples"> }): Field<string, "optional">;
  list<T>(item: Field<T>, opts: { minItems?: number; maxItems?: number } & FieldOptions<readonly T[]> & { default: readonly T[] }): Field<readonly T[], "defined">;
  list<T>(item: Field<T>, opts?: { minItems?: number; maxItems?: number } & FieldOptions<readonly T[]>): Field<readonly T[], "optional">;
  toggles<const K extends string>(opts: TogglesOptions<K>): Field<ToggleValues<K>, "defined">;
};

export type ToggleValues<K extends string> = Readonly<Record<K, boolean>>;
export type TogglesOptions<K extends string> = Omit<FieldOptions<ToggleValues<K>>, "default" | "required"> & {
  keys: readonly K[];
  keyLabels?: Partial<Record<K, string>>;     // catalog keys
  default?: Partial<Record<K, boolean>>;      // unlisted keys default to false
};

/** Channel types a channel field may accept. Vendor-free; mapped by the Discord adapter (T033). */
export type ChannelKind =
  | "text" | "voice" | "category" | "announcement"
  | "announcementThread" | "publicThread" | "privateThread"
  | "stage" | "directory" | "forum" | "media";

// Value types inferred from a declaration:
export type SettingsValues<D> = { readonly [K in keyof D["fields"]]: FieldValue<D["fields"][K]> };
export type SurfaceValues<D> = { /* like SettingsValues, each secret replaced by SecretState */ };
export interface SecretState { readonly isSet: boolean }
```

`SettingsValues` rule: a field **with a `default`** reads as `T`; every field **without a
default**, required or not, reads as `T | undefined` (a required field is unset until an
administrator sets it, FR-004). A `toggles` field always has a default, so it always reads as
`ToggleValues<K>`.

`ChannelKind` is aligned 1:1 with the guild channel types of discord-api-types' `ChannelType`
(`GuildText`, `GuildVoice`, `GuildCategory`, `GuildAnnouncement`, `AnnouncementThread`,
`PublicThread`, `PrivateThread`, `GuildStageVoice`, `GuildDirectory`, `GuildForum`,
`GuildMedia`). The core never imports that enum; the Discord adapter maps it (T033).

`toggles`: value is one boolean per declared key; a key missing from a submission or from
storage takes its per-key default, else `false`. A non-object value is `type`; an undeclared key
is `unknownChoice` and a non-boolean value is `type`, both reported at `field.key`
(e.g. `modules.foo`). Not allowed as a list item; no suggestions; cannot be a secret.

Declaration-time errors (thrown by `defineSettings` as `SettingsDeclarationError`): a field
without a label; a default that fails its own field validation; `default`/`examples` on
`secret`; not 1–25 static choices; `ui.group` naming an undeclared group; a text `maxLength`
above 4000; a list `maxItems` above 25 or an item kind lists cannot hold (`color`, `duration`,
`number`, `boolean`, `secret`, `list`, `toggles`); a `toggles` field repeating a key or giving a
`keyLabels` entry for an undeclared key; `version > 1` without `migrate`.

## Registry (boot)

```ts
export function createSettingsRegistry(input: {
  declarations: readonly SettingsDeclaration[];
  translations: TranslationRegistry; // must already contain the modules' catalogs
}): SettingsRegistry;
```

```ts
export interface SettingsRegistry {
  /** Every declaration, in registration order. */
  readonly declarations: readonly SettingsDeclaration[];
  get(id: string): SettingsDeclaration | undefined;
}
```

Throws `SettingsDeclarationError` at boot on a duplicate declaration id (FR-005) or on a catalog
key without an English source (FR-028): module title/description, group label/description,
field label/description/placeholder/unit, enum and static-suggestion choice labels (list items
included) and `toggles` `keyLabels`, each checked with `TranslationRegistry.has`.

`BotModule` gains an optional `settings?: readonly SettingsDeclaration[]` and
`defaultEnabled?: boolean` (default `true`) so the composition root can collect declarations the
same way it collects `translations`. The registry always includes the kernel's own declaration:

```ts
export const kernelSettings: SettingsDeclaration; // id "kernel": { modules: field.toggles (keys = registered module names), locale?: Locale }
```

## System settings, gating and status

```ts
export interface ModuleGate {
  isEnabled(moduleName: string, guildId: string): Promise<boolean>;
}
export function createModuleGate(service: SettingsService): ModuleGate;

// Routers (command, component, event) accept an optional `gate?: ModuleGate`.

export interface SettingsService {
  // … see below, plus:
  status(declaration: SettingsDeclaration, guildId: string): Promise<{ missing: readonly string[] }>;
}

// discord ring
export function requireConfigured(declaration: SettingsDeclaration, service: SettingsService): Guard;
export function resolveGuildLocale(interaction: BaseInteraction, service: SettingsService): Promise<Locale>;
```

Zod never appears in any exported type.

## Service

```ts
export function createSettingsService(deps: {
  registry: SettingsRegistry;
  store: SettingsStore;
  guilds: GuildDirectory;
  notifier: SettingsChangedNotifier;
  translator: Translator;
  clock: Clock;
  logger: Logger;
}): SettingsService;

export interface RequestContext {
  readonly guildId: string;
  readonly userId: string;
  readonly locale: string;
}

export type ValidationResult<D extends SettingsDeclaration> =
  | { readonly ok: true; readonly values: Partial<SettingsValues<D>> } // stored form; an unset field maps to undefined
  | { readonly ok: false; readonly issues: readonly SettingsIssue[] };

export interface SettingsService {
  /**
   * Module logic read: every declared field, secrets included. A field with no
   * valid stored value reads as its default (or undefined). A stored value that
   * fails its field is logged at `error` level. Never writes, except a lazy
   * migration (T050).
   */
  get<D extends SettingsDeclaration>(declaration: D, guildId: string): Promise<SettingsValues<D>>;

  /** Surface read: like get, each secret replaced by { isSet: boolean }. */
  getForSurface<D extends SettingsDeclaration>(declaration: D, guildId: string): Promise<SurfaceValues<D>>;

  /**
   * Validation only, shared by every surface.
   * @throws ValidationError when ctx.guildId ≠ guildId, or when patch is not a plain object.
   */
  validate<D extends SettingsDeclaration>(declaration: D, guildId: string, patch: unknown, ctx: RequestContext): Promise<ValidationResult<D>>;

  /**
   * Validate then merge onto the stored values in one write (null unsets a
   * field; stored keys no longer declared are dropped). Emits a change event.
   * @returns the written record.
   * @throws SettingsValidationError listing every invalid field.
   * @throws ConflictError on a revision mismatch or a record of a newer declaration version.
   * @throws ValidationError when ctx.guildId ≠ guildId, or when patch is not a plain object.
   */
  set<D extends SettingsDeclaration>(declaration: D, guildId: string, patch: unknown, ctx: RequestContext & { readonly expectedRevision?: number }): Promise<StoredSettings>;

  /**
   * Unset the given keys (or all), so they read as their defaults. Writes
   * nothing for a guild that never stored settings.
   * @throws SettingsValidationError when a key is not declared.
   * @throws ConflictError on a concurrent change or a record of a newer declaration version.
   * @throws ValidationError when ctx.guildId ≠ guildId.
   */
  reset<D extends SettingsDeclaration>(declaration: D, guildId: string, keys: readonly string[] | "all", ctx: RequestContext): Promise<void>;

  // Added by later tasks:

  /** Suggestions for one field: ≤ 25 results, 2.5 s budget, never throws. */
  suggest<D extends SettingsDeclaration>(declaration: D, fieldKey: string, query: string, ctx: RequestContext & { values: Record<string, unknown> }): Promise<readonly Choice[]>;

  /** Readable label of a stored value (for display). */
  label<D extends SettingsDeclaration>(declaration: D, fieldKey: string, value: unknown, ctx: RequestContext): Promise<string | undefined>;

  /** Translated JSON Schema description of one module (FR-030). */
  describe(declaration: SettingsDeclaration, locale: string): SettingsSchema;
}
```

A patch that is not a plain object (`null`, `undefined`, a string, a number, an array…) is a
malformed request: `validate` and `set` throw a plain `ValidationError` (not a
`SettingsValidationError`, and with no issue list) before anything is read or written.

Validation issues (`SettingsIssue`: `{ field, code, translation }`) name the field key,
`key[index]` for a list item, or `key.name` for a toggle.

`Choice` (`{ readonly name: string; readonly value: string | number }`) is exported from
`@azurioh/discord-kernel/settings` and re-exported from the command options module for
backward compatibility.

## Ports and in-memory twins

```ts
export interface SettingsStore {
  read(guildId: string, moduleId: string): Promise<StoredSettings | null>;
  write(record: StoredSettings, opts: { expectedRevision: number | null }): Promise<void>; // null = must not exist; ConflictError otherwise
  delete(guildId: string, moduleId: string): Promise<void>;
}
export function createInMemorySettingsStore(): SettingsStore;

export interface GuildDirectory {
  channel(guildId: string, id: string): Promise<{ id: string; name: string; kind: ChannelKind } | null>;
  role(guildId: string, id: string): Promise<{ id: string; name: string } | null>;
  member(guildId: string, id: string): Promise<{ id: string; name: string } | null>;
  searchChannels(guildId: string, query: string, kinds?: readonly ChannelKind[]): Promise<readonly { id: string; name: string; kind: ChannelKind }[]>;
  searchRoles(guildId: string, query: string): Promise<readonly { id: string; name: string }[]>;
  searchMembers(guildId: string, query: string): Promise<readonly { id: string; name: string }[]>;
}
export function createInMemoryGuildDirectory(seed: GuildDirectorySeed): GuildDirectory;
// discord.js implementation lives in the discord ring:
export function createDiscordGuildDirectory(client: Client): GuildDirectory;

export interface SettingsChangedNotifier {
  notify(event: SettingsChangedEvent): void;
  subscribe(listener: (event: SettingsChangedEvent) => void): () => void;
}
/**
 * Delivers events synchronously in-process. A throwing listener never stops the
 * others nor reaches the writer: its error is always logged at `error` level,
 * never swallowed; the logger is therefore required.
 */
export function createInProcessNotifier(logger: Logger): SettingsChangedNotifier;
```

## Testing subpath (`@azurioh/discord-kernel/settings/testing`)

```ts
export function runSettingsStoreContract(
  createStore: () => SettingsStore | Promise<SettingsStore>,
  runner: { describe: DescribeFn; it: ItFn; expect: ExpectFn },
): void;
```

## Discord adapter (`@azurioh/discord-kernel/discord/components/settings-editor`)

```ts
export function settingsEditorFromDeclaration<D extends SettingsDeclaration>(
  declaration: D,
  service: SettingsService,
  context: { guildId: string; userId: string; locale: Locale; translator: Translator },
): Promise<
  Pick<
    SettingsEditorOptions<unknown, never, string>,
    "fields" | "levels" | "initial" | "currentValue" | "displayValue" | "save" | "saveGroup" | "reset"
  >
>;
```

The adapter reads the guild's settings once (`initial`, the subject the screen opens on) and
lays the declaration out as `fields` plus nested `levels` when one card cannot hold every entry.
`context.translator` translates the texts shown in place of a value (a secret's "set" /
"not set", an unavailable channel, role or member). The caller spreads the result into
`mountSettingsEditor` with its own `ids`, `chrome`, `translator`, `clock` and `logger`.
`displayValue` gives the text a card-layout screen shows under each entry as "Current: …": a
channel, role or member as its Discord mention, an enum value or toggle as its label, a secret as
set / not set only (never its value), anything unset as "Not set". `mountSettingsEditor` takes it
as an optional hook, so existing direct users of `mountSettingsEditor` are
unaffected.
