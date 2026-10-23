# Patch: native release review blockers

Source review: tac-final-reviewer against `specs/chore-native-release.md` and `docs/RELEASING.md`. Only the two blockers below are in scope. The tech-debt items in the review are deferred.

## B1. `check-archive.sh` treats `SHA256SUMS` as optional

`scripts/release/check-archive.sh:8` and `:49-53` skip checksum verification when no sibling `SHA256SUMS` exists, then still print `ok`. Spec task 2 says the script "validates the name and the sibling `SHA256SUMS`".

Fix:
1. Make a missing `SHA256SUMS` fail closed: `[ -f "$dir/SHA256SUMS" ] && [ ! -L "$dir/SHA256SUMS" ] || die "SHA256SUMS missing beside $name" 4`.
2. Require exactly one matching line, so a duplicate entry yields a clear error rather than a multi-line mismatch.
3. If neither `sha256sum` nor `shasum` exists, die with an explicit message (`:43-47`) instead of reporting a checksum mismatch.
4. Update the header comment at `:8` (drop "if present").
5. `scripts/release/test.sh`: add `expect 4 'check: missing SHA256SUMS rejected'`. Build it from a `mkfix ok` fixture with `SHA256SUMS` removed.

## B2. `provenance.json` can report `"dirty": false` for an unclean or unknown source

At `scripts/release/package.sh:127`, `git status --porcelain --untracked-files=no` ignores untracked files. `go build` compiles untracked `.go` files in the package directories. If `git` is missing or the directory is not a repository, the empty output also becomes `dirty=false` beside `"commit": "unknown"`.

Fix:
1. Use `git -C "$repo" status --porcelain --untracked-files=normal`. Ignored files stay excluded.
2. If `git status` exits non-zero, emit `"dirty": null` (unknown) and never `false`. For example:
   ```sh
   if st=$(git -C "$repo" status --porcelain --untracked-files=normal 2>/dev/null); then
       if [ -n "$st" ]; then dirty=true; else dirty=false; fi
   else dirty=null; fi
   ```
3. `docs/RELEASING.md`: add one line saying `source.dirty` covers tracked and untracked (non-ignored) changes and is `null` when Git is unavailable.
4. `scripts/release/test.sh --build`: assert that `provenance.json` contains `"dirty": true`, `"dirty": false` or `"dirty": null`. Optionally assert `true` when the test creates an untracked file in a throwaway copy. Do not write into the real checkout.

## Validation

```sh
sh -n scripts/release/package.sh scripts/release/check-archive.sh scripts/release/test.sh
GOTOOLCHAIN=local sh scripts/release/test.sh --build
```
