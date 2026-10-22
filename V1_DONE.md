# Luuna Beacon — V1 Scope

## One-Liner
Git-native prompt management with section-based composition and inheritance — create, version, validate, and emit prompts as plain files for AI agent consumption.

## V1 Definition of Done

### Prompt CRUD
- [x] `luuna-beacon create` — creates prompts with sections, tags, schemas, emit overrides, frontmatter
- [x] `luuna-beacon show [name|name@version]` — displays raw prompt records
- [x] `luuna-beacon list` — lists prompts with filtering (--tag, --status, --extends)
- [x] `luuna-beacon update` — creates new versions (supports --section, --add-section, --remove-section, --tag, --untag, --schema, --extends, --name, --status, --emit-as, --fm, --remove-fm)
- [x] `luuna-beacon archive` — soft-deletes prompts

### Inheritance & Composition
- [x] `luuna-beacon render` — resolves inheritance, outputs merged sections (--format md|json)
- [x] Single-level inheritance via `extends` field; child sections override or extend parent
- [x] Depth limit: 5 levels enforced at render time (MAX_DEPTH=5 in render.ts)
- [x] Circular reference detection with descriptive error ("Circular inheritance: A → B → A")
- [x] Section override/append/inherit semantics fully implemented
- [x] Child can remove inherited sections via `luuna-beacon update --remove-section <name>` (empty body = omit)

### Versioning & History
- [x] `luuna-beacon history [name]` — shows all versions with timestamps
- [x] `luuna-beacon diff <name> <v1> <v2>` — section-aware diff (JSON mode shows added/modified/removed)
- [x] `luuna-beacon pin <name>@<version>` — locks to specific version (stored in prompt metadata)
- [x] `luuna-beacon unpin [name]` — removes pin
- [x] Version pinning respected by render/emit commands

### Emit Pipeline
- [x] `luuna-beacon emit <name>` — renders and writes to file (respects emitDir/emitAs per prompt)
- [x] `luuna-beacon emit --all` — bulk emit all active prompts
- [x] `luuna-beacon emit --check` — validates emitted files are up-to-date (exit code 1 if stale, for CI)
- [x] `.md` output format (default)
- [x] `.ts` (TypeScript module) output format when `emitAs` ends in `.ts`
- [x] Named emit targets: config `targets` section with tag-based routing (dir, default, tags)
- [x] Legacy `emitDir`/`emitDirByTag` config auto-converts to named targets on load

### Frontmatter (YAML Metadata)
- [x] Extracted from markdown imports (`extractFrontmatter` in import.ts)
- [x] Stored in prompt records (`frontmatter` field)
- [x] Rendered in emit output (YAML block before markdown content)
- [x] `--fm key=value` flag for `luuna-beacon create`/`luuna-beacon update` (repeatable)
- [x] `--remove-fm key` to delete individual frontmatter keys

### Schema Validation
- [x] `luuna-beacon schema create --name <text>` — creates schema with required/optional sections
- [x] `luuna-beacon schema show [name]` — displays schema
- [x] `luuna-beacon schema list` — lists all schemas
- [x] `luuna-beacon schema rule add <schema-name>` — adds regex validation rules (section, pattern, message)
- [x] `luuna-beacon validate [name]` — validates prompt against its schema
- [x] `luuna-beacon validate --all` — bulk validation

### Import
- [x] `luuna-beacon import <path>` — converts markdown file to luuna-beacon prompt
- [x] Auto-splits on `##` headers into named sections (configurable with --no-split)
- [x] Extracts YAML frontmatter from markdown before splitting
- [x] Section names derived from headings (lowercased, spaces → hyphens)

### Git Integration
- [x] `luuna-beacon sync` — stages and commits `.luuna/beacon/` changes
- [x] `.gitattributes` configured for union merge strategy on `prompts.jsonl`, `schemas.jsonl`
- [x] Dedup-on-read handles parallel branch merges (last-write-wins by ID+version)

### Agent Integration
- [x] `luuna-beacon prime` — outputs workflow context (list, create, emit, validation examples) for agents
- [x] `luuna-beacon onboard` — installs luuna-beacon section into CLAUDE.md

### Utility Commands
- [x] `luuna-beacon tree [name]` — shows inheritance tree (parent + children)
- [x] `luuna-beacon stats` — prompt statistics (active/draft/archived counts)
- [x] `luuna-beacon doctor` — diagnostic checks (.luuna/beacon/ integrity, file permissions, data consistency)
- [x] `luuna-beacon upgrade` — self-upgrade mechanism
- [x] `luuna-beacon completions` — shell completions (bash/zsh)
- [x] `luuna-beacon init` — initializes .luuna/beacon/ directory

### CLI Standards
- [x] `--json` flag produces structured output on all commands
- [x] Global flags: `-v/--version`, `-q/--quiet`, `--verbose`, `--timing`
- [x] ANSI colors with NO_COLOR environment variable support
- [x] Human-readable non-JSON output with error recovery suggestions

### Quality Gates
- [x] All 257 tests pass across 22 test files (`bun test`)
- [x] TypeScript strict mode clean (`bun run typecheck`)
- [x] Linting passes from canonical directory (`bun run lint`)
- [x] CI pipeline runs lint + typecheck + test on push/PR to main (actions/checkout@v6)
- [x] Published to npm by the upstream project at v0.2.2

## Explicitly Out of Scope for V1

- LLM-powered prompt optimization or rewriting
- A/B testing or prompt experimentation framework
- Remote prompt registry or sharing
- Prompt analytics (usage tracking, performance metrics)
- Visual prompt editor or web UI
- Conditional sections (if/else logic in prompts)
- Template variable interpolation (mustache/handlebars-style `{{var}}` substitution) — tracked separately in `greenhouse-04a7`
- Multi-repo prompt federation
- Prompt dependency graph beyond single-level inheritance
- Auto-versioning based on git commits
- JSONL garbage collection / compaction (version history is intentionally append-only for audit trail)

## Current State

Luuna Beacon is **V1-complete**. All 22 CLI commands are implemented and tested (archive, completions, create, diff, doctor, emit, history, import, init, list, onboard, pin, prime, render, schema, show, stats, sync, tree, update, upgrade, validate). 257 tests pass with zero failures across 22 test files. Lint and typecheck are clean. CI is green. Published to npm by the upstream project at v0.2.2.

The tool handles the full prompt lifecycle: create, compose via inheritance, version, validate against schemas, emit to files, and integrate with agents. The emit pipeline supports both markdown and TypeScript module output.

**Estimated completion: ~98-99%.** Fully functional for all V1 scope items.

### Infrastructure Notes

**Concurrent safety**: Advisory file locks (`.luuna/beacon/*.jsonl.lock`) with 30-second stale detection, 5-second timeout, and POSIX atomic writes (tmp+rename). Same pattern proven in production across missions and atlas.

**JSONL growth**: Append-only by design. Version history is the append log; no cleanup mechanism exists. ~27 prompt records after 6 weeks of development — growth rate is manageable.

**Config format**: Legacy `emitDir`/`emitDirByTag` formats auto-convert to named `targets` on load. Canonical `.luuna/beacon/config.yaml` still uses legacy format; it upgrades transparently on next `luuna-beacon sync`.

**Inheritance depth**: 5-level limit is hardcoded in render.ts. No production use case has exceeded 3 levels in 176 commits of development. Sufficient for V1.

**Lint from worktrees**: `bun run lint` fails when run from inside nested agent worktrees due to nested biome.json conflicts — this is an ecosystem-wide tooling issue, not a luuna-beacon bug. Lint passes when run from the canonical project root.

**TypeScript emit**: Backtick double-escaping edge case (code blocks in prompts emitted as `.ts`) was fixed in v0.2.2.

## Open Questions

- **Template variable interpolation** (`{{var}}`): Explicitly out of scope here, but greenhouse's supervisor prompt needs it (see `greenhouse-04a7`). Should luuna-beacon own variable substitution, or should consumers handle it at render time?
- **Max inheritance depth**: The current 5-level limit is sufficient for V1 real-world usage (max observed: 3 levels). Should it be made configurable, or documented as a hard constraint in help text and SPEC?
- **JSONL garbage collection**: Append-only growth is intentional for full audit trail. Is compaction of old/unreferenced versions ever needed, or is current growth rate acceptable long-term?
