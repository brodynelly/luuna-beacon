# Luuna Beacon

Prompt composition and versioned agent instructions. The Luuna package identity is **@luuna/beacon-cli**. It is maintained in the independent public repository [brodynelly/luuna-beacon](https://github.com/brodynelly/luuna-beacon). The npm package remains private and unpublished.

Run from this directory with Bun 1.4.3:

```bash
bun install --frozen-lockfile --ignore-scripts
bun src/index.ts --help
bun run verify
```

The standalone executable is `luuna-beacon`; `lbc` is the Luuna suite shortcut and `lb` remains a compatibility alias. `luuna beacon <args>` is the equivalent entry through Luuna's installed launcher. In a checkout, install dependencies with the command above and run `bun src/index.ts <args>`. Registry publication is disabled; use the Luuna CLI installer from the main checkout to make the commands available on PATH.

Project data lives in `.luuna/beacon/` (`prompts.jsonl`, `schemas.jsonl`, `artifacts.jsonl`, `config.yaml`). A legacy project directory from earlier layouts is moved there automatically on first use, with a one-line notice on stderr. Luuna consumes a pinned Git submodule and integrates through the CLI/JSON boundary (Atlas also exports a TypeScript library); runtime policy and approvals remain Luuna's responsibility.

## Complete skills, agents, and bundles

Beacon also captures versioned, self-contained file snapshots. Existing prompt commands remain unchanged; `lbc skill`, `lbc agent`, and `lbc bundle` add `import`, `update`, `list`, `show`, `history`, `read`, `verify`, and `export` subcommands. Imports store file bytes and logical relative paths in `artifacts.jsonl`, so the source directory can be removed after import. Each version has a content hash. A repeated identical import does not create another version, and a conflicting version after a Git merge is reported as an error.

```bash
lbc skill import path/to/skill --name review
lbc skill verify review
lbc skill export review --target claude             # .claude/skills/review/
lbc skill export review --target codex              # .agents/skills/review/
lbc agent import path/to/reviewer.md --name reviewer
lbc agent export reviewer --target claude           # .claude/agents/reviewer.md
lbc bundle import path/to/claude-plugin --name tac-final
lbc bundle export tac-final --out path/to/exported-plugin
claude --plugin-dir path/to/exported-plugin
```

A skill source must contain a root `SKILL.md`; an agent source is a Markdown file; a bundle source must contain `.claude-plugin/plugin.json`. Bundle export reconstructs a plugin package but does not install or enable it in Claude Code. `--force` replaces a prior Beacon-managed directory export; otherwise existing destinations are preserved. Source symlinks and credential-like files are rejected. Scripts are stored and exported as files, not executed by Beacon. Artifact records are project data, not Luuna runtime policy.

Self-upgrade is disabled while the package is private. Update through a reviewed commit in this repository; never replace this fork with a similarly named registry package. Dependency installs do not change Git hooks.

Read [UPSTREAM.md](UPSTREAM.md) for attribution and provenance, [AGENTS.md](AGENTS.md) for development rules, and [the original README](docs/UPSTREAM-README.md) for inherited command examples. Upstream release/runbook documents are historical references and do not authorize publication.

## Maintenance and releases

The repository owner and release maintainer is `brodynelly`. CI runs the frozen Bun 1.4.3 dependency installation, type checks, instruction checks and full suite on Linux. Registry publishing is disabled and requires no npm token. Luuna pins a reviewed commit, never a floating branch; update its submodule only after CI and the consumer smoke pass. See [MIGRATION.md](MIGRATION.md) for the verified source baseline.

## Origin / attribution

Luuna Beacon is Luuna's maintained MIT-licensed fork of [Canopy](https://github.com/jayminwest/canopy) by Jaymin West, imported from upstream version 0.2.6. The original license is preserved in [LICENSE](LICENSE) and provenance is recorded in [UPSTREAM.md](UPSTREAM.md).
