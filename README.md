# Luuna Beacon

Prompt composition and versioned agent instructions. The Luuna package identity is **@luuna/beacon-cli**. It is maintained in the independent public repository [brodynelly/luuna-beacon](https://github.com/brodynelly/luuna-beacon). The npm package remains private and unpublished.

Run from this directory with Bun 1.4.3:

```bash
bun install --frozen-lockfile --ignore-scripts
bun src/index.ts --help
bun run verify
```

The primary executable is `luuna-beacon` with `lb` as its short alias. Direct source execution uses the command above.

Project data lives in `.luuna/beacon/` (`prompts.jsonl`, `schemas.jsonl`, `config.yaml`). A legacy project directory from earlier layouts is moved there automatically on first use, with a one-line notice on stderr. Luuna consumes a pinned Git submodule and integrates through the CLI/JSON boundary (Atlas also exports a TypeScript library); runtime policy and approvals remain Luuna's responsibility.

Self-upgrade is disabled while the package is private. Update through a reviewed commit in this repository; never replace this fork with a similarly named registry package. Dependency installs do not change Git hooks.

Read [UPSTREAM.md](UPSTREAM.md) for attribution and provenance, [AGENTS.md](AGENTS.md) for development rules, and [the original README](docs/UPSTREAM-README.md) for inherited command examples. Upstream release/runbook documents are historical references and do not authorize publication.

## Maintenance and releases

The repository owner and release maintainer is `brodynelly`. CI runs the frozen Bun 1.4.3 dependency installation, type checks, instruction checks and full suite on Linux. Registry publishing is disabled and requires no npm token. Luuna pins a reviewed commit, never a floating branch; update its submodule only after CI and the consumer smoke pass. See [MIGRATION.md](MIGRATION.md) for the verified source baseline.

## Origin / attribution

Luuna Beacon is Luuna's maintained MIT-licensed fork of [Canopy](https://github.com/jayminwest/canopy) by Jaymin West, imported from upstream version 0.2.6. The original license is preserved in [LICENSE](LICENSE) and provenance is recorded in [UPSTREAM.md](UPSTREAM.md).
