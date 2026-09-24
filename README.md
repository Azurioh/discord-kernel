# discord-kernel

pnpm workspace of the discord-kernel libraries, versioned with changesets.

| Package | Path |
|---|---|
| [`@azurioh/discord-kernel`](packages/kernel/README.md) | `packages/kernel` |

- Architecture, planned packages and feature specs: [`docs/roadmap.md`](docs/roadmap.md).
- Principles every package follows: [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## Development

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm knip && pnpm test && pnpm build
```

Every script runs across the whole workspace from the repository root.
