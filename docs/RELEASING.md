# Releasing Luuna Beacon native archives

Nothing in this repository publishes anything. The scripts and workflow below produce **unpublished** archives, checksums and self-reported provenance. Publication (tags, GitHub Releases, signing, attestations, registries) is a separate owner decision. Those steps are listed at the end.

## Archive contract

| Item | Value |
| --- | --- |
| File | `luuna-beacon_<version>_<darwin\|linux>_<arm64\|amd64>.tar.gz` |
| Entries | exactly `bin/luuna-beacon` and `bin/lbc`: regular files, mode 0755, uid/gid 0, fixed mtime, no directory entries |
| Excluded | `lb` (a compatibility alias kept for source builds only, too generic for a public `PATH`) |
| Beside the archive | `SHA256SUMS`, `provenance.json`, `LICENSE`, `UPSTREAM.md` |

`LICENSE` (MIT, upstream notice) and `UPSTREAM.md` ship **beside** the archive, not inside it. The hub installer only accepts `bin/<public executable>` entries, so attribution travels as separate release files. Every file is listed in `SHA256SUMS`.

Both executables are built from their own `cmd/` package. All three `cmd/*/main.go` files call `cli.Run(os.Args[1:], …)` and never inspect `argv[0]`, so `lbc` behaves exactly like `luuna-beacon` with the same arguments. `check-archive.sh` asserts this on host-matching archives by comparing `--version` and `--json --version` output.

## Versions

- **Archive version**: the `--version` input. It is validated as `MAJOR.MINOR.PATCH[-PRERELEASE]` and appears in the file name and as `archive_version` in `provenance.json`.
- **Internal version**: `const version` in `internal/cli/cli.go` (currently `0.2.6`), printed by `luuna-beacon --version`. It is a Go `const`, so `-ldflags -X` cannot override it, and the build passes only `-s -w`. It is recorded as `internal_version` in `provenance.json`. Making the two match is an owner release action: edit the constant in a reviewed change.

## Local dry run (host platform only)

```sh
GOTOOLCHAIN=local make verify
GOTOOLCHAIN=local sh scripts/release/test.sh --build     # offline script tests plus a real host build
out=$(mktemp -d)
GOTOOLCHAIN=local sh scripts/release/package.sh --version 0.0.0-local --out "$out"
sh scripts/release/check-archive.sh --require-run "$out"/luuna-beacon_0.0.0-local_*.tar.gz
# or: make release-local VERSION=0.0.0-local OUT=dist/release-local   (dist/ is git-ignored)
```

`package.sh --os/--arch` can cross-build, because `CGO_ENABLED=0`. `check-archive.sh` checks the structure of any archive but runs the binaries only when the archive matches the host. `--require-run` makes a non-host archive fail (exit 6) instead of falling back to a structure-only check. CI and `make release-local` use it.

`check-archive.sh` requires a regular, non-symlink `SHA256SUMS` beside the archive that lists the archive name exactly once with a matching SHA-256. A missing, symlinked, duplicate, malformed or mismatched entry fails with exit 4. A missing `sha256sum`/`shasum` fails with exit 3.

`package.sh` stages every output privately and moves the outputs into `--out` only after all steps succeed. A failure, including a failing `tar` (it writes an intermediate file, so its exit status is not masked by `gzip`), removes the known output names again. It also removes `--out` if this run created it and it is empty. `--out` is never deleted recursively.

`provenance.json` `source.dirty` covers tracked and untracked (non-ignored) changes, because `go build` compiles untracked `.go` files. It is `null` when Git is unavailable or the checkout is not the root of its own repository. In that case `source.commit` is `"unknown"`.

### Toolchain pin limitations

- CI pins Go `1.27.0` through `actions/setup-go` and sets `GOTOOLCHAIN=local`, so `go.mod`'s `go 1.27.0` line never triggers a toolchain download.
- Locally, `GOTOOLCHAIN=local` uses whatever Go is installed. The local validation for this change used `go1.27.3 darwin/arm64`. That satisfies `go 1.27.0`, but it is not byte-identical to the CI build. `provenance.json` records the exact `go_version`.
- Builds are reproducible in their tar and gzip metadata (owner, mtime, `gzip -n`) for a given toolchain. `package.sh` pins `TZ=UTC`, so the fixed mtime does not depend on the builder's time zone. `test.sh --build` compares archives built under two different `TZ` values. Bit-for-bit binary reproducibility across Go patch releases is not claimed.
- Linux binaries are static (`CGO_ENABLED=0`). musl/Alpine are not separately tested.

## Workflow: `.github/workflows/release.yml`

- Trigger: `workflow_dispatch` with a `version` input only. There is no tag or push trigger.
- Permissions: `contents: read`. Checkout uses `persist-credentials: false`.
- Matrix, each job building natively on its runner:

  | Runner | Target |
  | --- | --- |
  | `macos-14` | darwin/arm64 |
  | `macos-15-intel` | darwin/amd64 (replaces the retired `macos-13`) |
  | `ubuntu-latest` | linux/amd64 |
  | `ubuntu-24.04-arm` | linux/arm64 |

- Steps: `go test`, then `go vet`, then `scripts/release/test.sh`, then `package.sh`, then `check-archive.sh --require-run` (the job fails if its runner cannot execute the archive it built), then `actions/upload-artifact`.
- The attestation step is present only as a commented-out owner gate. The workflow has no `gh release`, release action, `npm publish` or registry step.

## Deferred owner gates (not done here)

1. Run `release.yml` manually and download the four artifacts.
2. On each claimed platform, verify `SHA256SUMS`, run `check-archive.sh`, and review `provenance.json`. Provenance is self-reported, not an attestation.
3. Decide on macOS signing/notarization and on GitHub build attestations. Enabling attestations needs `id-token: write` and `attestations: write`.
4. Create the tag and GitHub Release and upload the assets, including `LICENSE` and `UPSTREAM.md`.
5. Add the hub manifest rows (URLs and SHA256s copied from the released assets) through a reviewed PR in `luuna-ai-os`.

npm and other registries remain unpublished and are a separate decision.
