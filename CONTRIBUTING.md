# Contributing to Luuna Beacon

Luuna Beacon is a Go CLI. Keep changes focused, use ordinary descriptive branch and commit names, and do not publish, push, or change runtime policy as part of component work.

## Getting started

Install Go 1.27.0, then run:

```bash
go test ./...
go vet ./...
go build ./cmd/luuna-beacon ./cmd/lbc ./cmd/lb
```

`luuna-beacon`, `lbc`, and `lb` are compatibility entrypoints over the same CLI implementation.

## Code and tests

- Commands and argument handling live in `internal/cli`.
- CLI entrypoints live in `cmd/`.
- Filesystem stores, migration, and artifact logic live in `internal/`.
- Use real temporary directories for tests; avoid mocks for project-state behavior.
- Preserve JSON response envelopes, JSONL/YAML record contracts, lock behavior, atomic writes, and secret redaction.

Run `gofmt` on changed Go code and include focused tests for externally visible behavior. CI requires `go test ./...`, `go vet ./...`, and builds on Linux and Windows.

## Pull requests

Keep one concern per pull request, explain the behavior change and evidence, and ensure all Go validation passes. For security reports, follow [SECURITY.md](SECURITY.md). Contributions are licensed under [MIT](LICENSE).
