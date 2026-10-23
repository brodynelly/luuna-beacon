# Chore: native release packaging for Luuna Beacon (C-beacon)

Scoped from the hub plan `luuna-ai-os/specs/feature-native-cli-distribution.md`, task **C-beacon**. Only this repository is in scope. Hub tasks (H0–H7) and the other component tasks belong to other agents.

## Goal

Produce checksum-verified, **unpublished** native archives of the public Beacon executables (`luuna-beacon`, `lbc`) for darwin/linux × arm64/amd64. Uploading them as workflow artifacts is the only output.

## Facts verified in this repo

- `cmd/luuna-beacon`, `cmd/lbc` and `cmd/lb` are identical `main.go` files that call `cli.Run(os.Args[1:], …)`. They have no `argv[0]` dispatch.
- The version is `const version = "0.2.6"` in `internal/cli/cli.go`. It is a constant, so `-ldflags -X` cannot set it. No version symbol is invented.
- There is no `vendor/` directory, so the build does not use `-mod=vendor`. The repo has no Bun or `package.json`, so no Bun verification applies.
- `LICENSE` is MIT (the upstream notice). `UPSTREAM.md` holds the provenance.

## Tasks

1. `scripts/release/package.sh`: POSIX script.
   - Validates `--version` (semver, charset, length) and `--out` (new or empty, not a symlink), plus `--os` and `--arch`.
   - Builds `CGO_ENABLED=0 go build -trimpath -buildvcs=false -ldflags "-s -w"` into a temporary stage.
   - Writes a deterministic ustar `tar.gz` containing only `bin/luuna-beacon` and `bin/lbc` (0755, uid/gid 0, fixed mtime, `gzip -n`).
   - Writes `SHA256SUMS`, plus `provenance.json` with `archive_version` separate from `internal_version`.
   - Copies `LICENSE` and `UPSTREAM.md` beside the archive.
2. `scripts/release/check-archive.sh`:
   - Validates the name and the sibling `SHA256SUMS`.
   - Requires the listing to be exactly the two entries, both regular files with mode 0755, before extracting.
   - Re-checks the extracted files.
   - On host-matching archives, runs `--version` and `--help` through both names and compares `--json --version` to prove the alias preserves arguments.
3. `scripts/release/test.sh`: offline tests.
   - Rejection of bad arguments.
   - Fixture archives for valid, extra entry, symlink, mode, missing, directory, `..`, checksum and platform name.
   - `--build` adds a real host package and check.
4. `.github/workflows/release.yml`:
   - Triggered by `workflow_dispatch` only, with `contents: read`.
   - Matrix: `macos-14` (darwin/arm64), `macos-15-intel` (darwin/amd64; the plan's `macos-13` is retired), `ubuntu-latest`, `ubuntu-24.04-arm`.
   - Steps: test, then package, then check, then `upload-artifact`.
   - The attestation step is commented out as an owner gate.
5. `Makefile`: `release-test` and `release-local` targets.
6. `docs/RELEASING.md`: dry-run steps, the archive contract, the version split, toolchain pin limitations, and the deferred owner gates.
7. `.gitignore`: add `.tac/runs/`.

## Deviations from the hub plan

- `macos-13` → `macos-15-intel` for darwin/amd64.
- No `-X …version` ldflag, because the version is a `const`. The archive version is recorded in provenance instead.
- `LICENSE` and `UPSTREAM.md` ship beside the archive, not inside it. This preserves the strict `bin/` allowlist.

## Out of scope

Existing `ci.yml` and runtime sources (`cmd/`, `internal/`) are not edited. Out of scope too: tags, releases, signing, attestations, registry publication, and any other repository.

## Validation

```sh
GOTOOLCHAIN=local make verify
GOTOOLCHAIN=local sh scripts/release/test.sh --build
out=$(mktemp -d); GOTOOLCHAIN=local sh scripts/release/package.sh --version 0.0.0-local --out "$out"
sh scripts/release/check-archive.sh "$out"/luuna-beacon_0.0.0-local_*.tar.gz
grep -nE 'gh release|action-gh-release|npm publish|cargo publish|attest-build-provenance' .github/workflows/release.yml   # only commented lines
```
