# Data Model: Module Settings

All values are JSON-serialisable so that any database can store them.

## SettingsDeclaration

| Attribute | Type | Rules |
|---|---|---|
| `id` | string | Unique across all registered modules (FR-005). Lowercase kebab-case. |
| `version` | positive integer | Starts at 1. Increases when stored data must be reshaped. |
| `fields` | record of `Field` | At least 1 field. Keys are camelCase and stable across versions. |
| `groups` | record of `Group` (optional) | Every `field.ui.group` must name a declared group. |
| `migrate` | `(fromVersion, raw) => unknown` (optional) | Required when `version > 1`. |
| `ui` | `{ icon?, groupOrder? }` (optional) | Semantic hints only (FR-020). |
| `labels` | `{ title: key, description?: key }` | Catalog keys. |
| `access` | opaque (optional) | Stored, not enforced (FR-032). |

## Field

Common attributes:

| Attribute | Type | Rules |
|---|---|---|
| `kind` | see table below | |
| `label` | catalog key | Required. English source must exist (FR-028). |
| `description`, `placeholder`, `unit` | catalog key (optional) | |
| `required` | boolean, default `false` | Required without default ⇒ "unset" until set (FR-004). Rejects `null` in a submission. Does not change the read type. |
| `default` | value of the field's type (optional) | Must pass the field's own validation at declaration time. Forbidden on `secret`. Always present on `toggles` (see below). |
| `ui` | `{ group?, order?, hint?, advanced?, examples? }` | `examples` forbidden on `secret`. |
| `suggest` | `Suggestions` (optional) | Only on `text`, `integer` and their list variants. |
| `access` | opaque (optional) | FR-032. |

Kinds and stored value types:

| Kind | Stored value | Constraints |
|---|---|---|
| `channel` | snowflake string | `types?`: allowed channel types |
| `role` | snowflake string | |
| `user` | snowflake string | |
| `color` | `"#RRGGBB"` string | Input accepts hex and registered aliases (existing parser) |
| `duration` | integer seconds | `min?`, `max?` in seconds |
| `enum` | one of declared literal values | 1–25 choices, each with a label key |
| `integer` | integer | `min?`, `max?` |
| `number` | finite number | `min?`, `max?` |
| `text` | string | `minLength?`, `maxLength?` (≤ 4000, Discord text input limit) |
| `boolean` | boolean | |
| `secret` | string | Write-only for surfaces (FR-008, FR-031) |
| `list` | array of the item kind | Item kind ∈ channel, role, user, enum, integer, text; `minItems?`, `maxItems?` (≤ 25); duplicates rejected |
| `toggles` | record of declared key → boolean | `keys` (no duplicates); `keyLabels?` (catalog key per declared key); `default?` sets some keys, every other key defaults to `false`. Not allowed as a list item; no `suggest`, not secret |

### Toggles

- **Value**: `Readonly<Record<K, boolean>>` with every declared key present. The field always has a
  value: the builder turns the partial `default` into a full record (unlisted keys `false`).
- **Parsing a submission**: the input must be a plain object (else `type` on the field); a key
  not in `keys` is `unknownChoice` and a non-boolean value is `type`, both reported at
  `field.key` (e.g. `modules.foo`). A key missing from the input takes its per-key default, else
  `false`, so the stored form is always the full record.
- **Reading a stored value** (FR-017): a stored key no longer in `keys` (e.g. a removed module)
  is ignored, not an issue: the other keys still read as stored, and nothing is logged. The rest
  of the value is parsed as a submission (a non-boolean declared key still fails the field).
  The next write of the module drops the undeclared keys, even when the field is not in the
  patch.
- **Declaration checks**: duplicate keys, a `keyLabels` entry for an undeclared key, and a
  `default` naming an undeclared key are rejected by `defineSettings`. `keyLabels` catalog keys
  must have an English source (FR-028), checked by `createSettingsRegistry`.

## Values read by module logic (`SettingsValues<D>`)

One entry per declared field, secrets included:

| Field | Read type |
|---|---|
| has a `default` (every `toggles` field) | `T` |
| no `default`, required or not | `T \| undefined` (a required field stays unset until set) |

A stored value that fails its field's validation reads as the field's default (or `undefined`);
the failing keys are logged at `error` level with the guild and module ids. Nothing is written.

## Group

| Attribute | Type | Rules |
|---|---|---|
| `label` | catalog key | |
| `description` | catalog key (optional) | |
| `order` | integer (optional) | |
| `access` | opaque (optional) | |

## Suggestions

Either static or dynamic:

| Variant | Attributes | Rules |
|---|---|---|
| static | `choices: { value, label: key }[]` | 1–25 entries |
| dynamic | `resolve(query, ctx) → Choice[]`, `label?(value, ctx) → string \| undefined`, `strict?: boolean` | Results capped at 25; 2.5 s budget |

`ctx` = `{ guildId, locale, userId, values }`, where `values` are the other values currently
entered (possibly unsaved).

Channel, role and user fields get built-in suggestions from `GuildDirectory`.

## StoredSettings

The record a `SettingsStore` persists, one per `(guildId, moduleId)`.

| Attribute | Type | Rules |
|---|---|---|
| `guildId` | snowflake string | Key part. |
| `moduleId` | string | Key part. Equals `SettingsDeclaration.id`. |
| `version` | integer | Declaration version the values were written under. |
| `revision` | integer | Starts at 1 on first write; +1 on each write. Used for optimistic concurrency. |
| `values` | record of JSON values | Only declared, valid fields are written. Unset fields are absent. |
| `updatedAt` | ISO-8601 string | From the `Clock` port. |
| `updatedBy` | snowflake string (optional) | Who made the change; groundwork for the audit log (spec 4). |

### Lifecycle

```text
(no record) --first valid write--> revision 1
revision n  --valid write with expectedRevision n--> revision n+1
revision n  --write with expectedRevision ≠ n--> ConflictError, unchanged
version v < declared --read--> migrate + validate --ok--> write (version = declared, revision+1)
                                                 --fail--> unchanged, defaults for invalid fields
version v > declared --read--> unchanged, never written
```

## SettingsChangedEvent

| Attribute | Type |
|---|---|
| `guildId` | snowflake string |
| `moduleId` | string |
| `changedKeys` | string[] |
| `revision` | integer |
| `changedBy` | snowflake string (optional) |

## Kernel system settings (declaration id `kernel`)

| Field | Kind | Default | Rules |
|---|---|---|---|
| `modules` | `toggles`, keys = registered module names | each module's `defaultEnabled` (default `true`) | Keys limited to registered module names (`unknownChoice` otherwise) |
| `locale` | enum of supported locales | unset | Unset ⇒ FR-038 skips this step |

Stored like any other `StoredSettings` record, with `moduleId = "kernel"`.

## ConfigurationStatus

| Attribute | Type |
|---|---|
| `missing` | field keys that are required, have no default, and are unset |

## SettingsIssue (validation error item)

| Attribute | Type |
|---|---|
| `field` | field key, `list[index]` for a list item, or `toggles.key` for a toggle |
| `code` | `required`, `type`, `min`, `max`, `minLength`, `maxLength`, `minItems`, `maxItems`, `duplicate`, `channelType`, `notFound`, `unknownChoice`, `unknownField` |
| `translation` | `{ key, params }` (existing `ErrorTranslation` shape) |

A failed submission raises `SettingsValidationError` (a `ValidationError`) carrying all issues.
A patch that is not a plain object (`null`, a string, an array…) is a malformed request, not an
invalid value: `validate` and `set` throw a plain `ValidationError` with no issues.
