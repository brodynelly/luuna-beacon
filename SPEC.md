# Luuna Beacon specification

Luuna Beacon is a Go CLI for git-native prompt composition and versioned agent artifacts. It is intentionally a component: Luuna runtime policy, approvals, agent execution, Mission planning, and Atlas priming remain outside this repository.

## Public interface

The executables `luuna-beacon`, `lbc`, and `lb` run the same CLI. Every command supports machine-readable output through `--json`; successful JSON responses include `success: true` and a command identifier, while failures include `success: false`, the command, and an error string.

Public command groups are:

- Prompt lifecycle: `init`, `create`, `update`, `archive`, `show`, `list`, `history`, `tree`, `stats`, `diff`, `pin`, `unpin`, `import`, `render`, `emit`, `validate`, and `sync`.
- Project configuration and schemas: `config schema|show|set|unset` and `schema create|show|list|rule add`.
- Agent-facing context: `prime`, `onboard`, `doctor`, `completions`, and `upgrade` (which deliberately declines unpublished self-upgrades).
- Versioned snapshots: `skill`, `agent`, and `bundle`, each with `import`, `update`, `list`, `show`, `history`, `read`, `verify`, and `export`.

## Project data contract

All state lives in `.luuna/beacon/`:

```text
config.yaml       project configuration and emit targets
prompts.jsonl     append-only prompt version history
schemas.jsonl     append-only schema versions
artifacts.jsonl   append-only skill, agent, and bundle snapshots
```

The legacy `.canopy` project directory migrates automatically before normal operations. JSONL is the durable database: records retain stable IDs and versions, mutations append a later version, and ordinary lookup resolves the current record rather than historical aliases. Prompt records preserve names, descriptions, sections, inheritance, mixins, tags, schemas, output settings, pins, frontmatter, atlas metadata, status, and timestamps.

Configuration supports the current `targets` map and reads legacy `emitDir` and `emitDirByTag` routing. Archived prompts are hidden by default but remain addressable in history and explicit status listings.

## Safety and concurrency

Mutations use advisory lock files and write complete replacement files through a temporary sibling. Windows uses replace-existing semantics so a normal mutation can overwrite an existing JSONL or config file safely. Locks expire after a bounded stale period. Export staging uses a backup-and-restore path; `--force` only replaces a directory carrying a matching Beacon ownership marker. Artifact imports reject symlinks and credential-like source files, retain file digests and executable mode, and never execute captured content.

## Composition and emission

Rendering resolves parent inheritance first, then mixins from left to right, then the focal prompt. Later sections replace earlier sections of the same name; an empty section removes an inherited one. Rendering detects cycles and enforces a bounded inheritance depth. Emit writes Markdown by default and TypeScript for an `.ts` output name. A per-prompt output directory overrides target routing; target tag routing overrides the default target.

## Validation and tooling

The supported contributor gate is:

```bash
go test ./...
go vet ./...
go build ./cmd/luuna-beacon ./cmd/lbc ./cmd/lb
```

CI runs that gate on Linux and Windows. The project has no registry publication or self-upgrade process; consumers pin reviewed Git commits.
