# Native release packaging

This is a summary of the native archive packaging for `luuna-beacon` and `lbc`. The full contract and owner steps are in [RELEASING.md](RELEASING.md). Nothing here publishes, tags, signs or attests anything.

## What is implemented

| Piece | Purpose |
| --- | --- |
| `scripts/release/package.sh` | Validates `--version`/`--out`/`--os`/`--arch`. Builds `CGO_ENABLED=0 -trimpath -buildvcs=false -ldflags "-s -w"`. Writes a deterministic tar.gz holding only `bin/luuna-beacon` and `bin/lbc`, plus `SHA256SUMS`, `provenance.json`, `LICENSE` and `UPSTREAM.md` beside it. |
| `scripts/release/check-archive.sh` | Validates the name, requires a matching `SHA256SUMS` entry, and checks for exactly two 0755 regular entries before and after extraction. On a host-matching archive it runs both names to prove `lbc` matches `luuna-beacon`. |
| `scripts/release/test.sh` | Offline tests: bad arguments, plus fixture archives that are valid or have an extra entry, a symlink, a bad mode, a missing entry, a directory, `..`, a bad or missing checksum, or a bad platform name. `--build` adds a real host package/check and a `TZ` reproducibility comparison. |
| `.github/workflows/release.yml` | `workflow_dispatch` only, `contents: read`. Native matrix: darwin/arm64 (`macos-14`), darwin/amd64 (`macos-15-intel`), linux/amd64 (`ubuntu-latest`), linux/arm64 (`ubuntu-24.04-arm`). Steps: test, then package, then `check-archive.sh --require-run`, then `upload-artifact`. |
| `Makefile` | `release-test` and `release-local` targets. |

`lb` stays a source-build alias and is not shipped in archives.

## Versions

The archive version is the validated `--version` input. It goes in the file name and in `archive_version`. The internal version is the Go `const` in `internal/cli/cli.go` and is recorded as `internal_version`. Because it is a `const`, ldflags cannot override it. Aligning the two is a reviewed source change.

`provenance.json` is self-reported. `source.dirty` covers tracked and untracked (non-ignored) changes. It is `null` when Git cannot tell, and then `source.commit` is `"unknown"`.

## Commands

```sh
GOTOOLCHAIN=local make verify
GOTOOLCHAIN=local make release-test          # sh scripts/release/test.sh --build
out=$(mktemp -d)
GOTOOLCHAIN=local sh scripts/release/package.sh --version 0.0.0-local --out "$out"
sh scripts/release/check-archive.sh --require-run "$out"/luuna-beacon_0.0.0-local_*.tar.gz
make release-local VERSION=0.0.0-local OUT=dist/release-local   # OUT must be new or empty
```

`--os`/`--arch` can cross-build. `check-archive.sh` checks structure for any platform but runs binaries only on the host. With `--require-run`, a non-host archive fails (exit 6).

## Validation status

- Review passed, including the patch for the two review blockers: `SHA256SUMS` now fails closed, and `dirty` reports `null` when unknown instead of `false`.
- Native release tests reported 60 passing on the local host (darwin/arm64, Go 1.27.3).
- The `release.yml` matrix has not been run. darwin/amd64, linux/amd64 and linux/arm64 archives have not been built or executed natively. Only the local host platform has been exercised.
- Local Go (1.27.3) differs from the CI pin (1.27.0), so local and CI binaries are not byte-identical. Tar and gzip metadata are deterministic for a given toolchain. Binary reproducibility across Go patch releases is not claimed.
- musl/Alpine are untested.

## Deferred (owner gates)

1. Dispatch `release.yml` and download the four artifacts.
2. On each claimed platform, verify `SHA256SUMS`, run `check-archive.sh`, and review `provenance.json`.
3. Decide on macOS signing/notarization and on GitHub build attestations. Attestations need `id-token: write` and `attestations: write`. The step is commented out.
4. Create the tag and GitHub Release and upload all assets, including `LICENSE` and `UPSTREAM.md`.
5. Add the hub manifest rows in `luuna-ai-os` through a reviewed PR.

Registry publication (npm or others) remains out of scope. See [RELEASING.md](RELEASING.md#deferred-owner-gates-not-done-here).
