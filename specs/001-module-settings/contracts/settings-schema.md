# Contract: Settings description (JSON Schema draft 2020-12)

Output of `SettingsService.describe(declaration, locale)`. Consumed by the future HTTP API and
web dashboard. Standard keywords carry everything a generic JSON Schema form can use; the
`x-kernel` keyword carries kernel-specific hints.

## Example (locale `fr`)

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:discord-kernel:settings:ticket:v2",
  "title": "Tickets",
  "description": "Configuration du système de tickets",
  "type": "object",
  "additionalProperties": false,
  "required": ["category"],
  "properties": {
    "category": {
      "type": "string",
      "pattern": "^[0-9]{17,20}$",
      "title": "Catégorie des tickets",
      "x-kernel": { "kind": "channel", "channelTypes": ["category"], "group": "general", "order": 1, "suggest": "guild" }
    },
    "maxOpen": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5,
      "default": 1,
      "examples": [1, 3],
      "title": "Tickets ouverts max",
      "x-kernel": { "kind": "integer", "group": "limits", "order": 2, "unit": "tickets", "hint": "slider", "advanced": true }
    },
    "game": {
      "type": "string",
      "title": "Jeu",
      "x-kernel": { "kind": "text", "suggest": "dynamic", "strict": true }
    },
    "region": {
      "type": "string",
      "oneOf": [
        { "const": "eu", "title": "Europe" },
        { "const": "na", "title": "Amérique du Nord" }
      ],
      "default": "eu",
      "title": "Région",
      "x-kernel": { "kind": "enum", "suggest": "static" }
    },
    "webhookKey": {
      "type": "string",
      "writeOnly": true,
      "title": "Clé du webhook",
      "x-kernel": { "kind": "secret" }
    }
  },
  "x-kernel": {
    "module": "ticket",
    "version": 2,
    "icon": "ticket",
    "locale": "fr",
    "groups": [
      { "id": "general", "title": "Général", "order": 1 },
      { "id": "limits", "title": "Limites", "order": 2 }
    ]
  }
}
```

## Rules

- `x-kernel.kind` is always present on every property.
- `x-kernel.suggest` ∈ `none` (omitted), `static`, `dynamic`, `guild`. `dynamic` means the
  surface must call the suggestion endpoint of the future HTTP API; `guild` means built-in
  channel/role/user suggestions.
- `x-kernel.choices` accompanies `suggest: "static"` on a `text` or `integer` field: the declared
  suggestions as `[{ "const": <value>, "title": <translated label> }]`, in declared order. They
  suggest values without restricting them (an `enum` restricts its values through `oneOf`).
- Secret properties: `writeOnly: true`; never `default`, `examples`, `const` or `enum`.
- `locale` is the resolved locale actually used (after fallback).
- All `title`/`description` strings are already translated; missing keys in the requested locale
  fall back to English individually.
- The document validates against the draft 2020-12 meta-schema (test in SC-003 / US4).
