#!/bin/sh
# Build a public Luuna Beacon release archive for one platform.
#
#   sh scripts/release/package.sh --version V --out DIR [--os darwin|linux] [--arch arm64|amd64]
#
# Writes into DIR (which must be new or empty):
#   luuna-beacon_<V>_<os>_<arch>.tar.gz  entries: bin/luuna-beacon, bin/lbc (0755 regular files)
#   SHA256SUMS                           checksums of every other file in DIR
#   provenance.json                      self-reported build metadata (not an attestation)
#   LICENSE, UPSTREAM.md                 attribution shipped beside, not inside, the archive
#
# Nothing is published. The archive version (V) is independent of the CLI's
# internal version constant, which is recorded separately in provenance.json.
# Outputs are staged privately and moved into DIR only after every step
# succeeds. On failure the known output names are removed again, and a DIR
# created by this run is removed if it is empty.
set -eu
# The fixed mtime is written with `touch -t`, which reads local time.
TZ=UTC
export TZ

usage() {
	cat <<'EOF'
usage: package.sh --version V --out DIR [--os darwin|linux] [--arch arm64|amd64]

  --version V   archive version, semver: MAJOR.MINOR.PATCH[-PRERELEASE]
  --out DIR     output directory; created if missing, must be empty
  --os OS       target OS (default: go env GOHOSTOS)
  --arch ARCH   target arch (default: go env GOHOSTARCH)
EOF
}

die() { printf 'package.sh: %s\n' "$1" >&2; exit "${2:-1}"; }

version=''
out=''
target_os=''
target_arch=''
while [ $# -gt 0 ]; do
	case $1 in
	--version|--out|--os|--arch)
		[ $# -ge 2 ] || die "$1 requires a value" 2
		case $1 in
		--version) version=$2 ;;
		--out) out=$2 ;;
		--os) target_os=$2 ;;
		--arch) target_arch=$2 ;;
		esac
		shift 2 ;;
	-h|--help) usage; exit 0 ;;
	*) usage >&2; die "unknown argument: $1" 2 ;;
	esac
done

[ -n "$version" ] || die '--version is required' 2
[ -n "$out" ] || die '--out is required' 2

validate_version() {
	case $1 in
	*[!0-9A-Za-z.-]*) return 1 ;;
	esac
	[ "${#1}" -le 64 ] || return 1
	printf '%s\n' "$1" | grep -Eq '^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z][0-9A-Za-z.-]*)?$'
}
validate_version "$version" || die "invalid --version: $version (want MAJOR.MINOR.PATCH[-PRERELEASE])" 2

command -v go >/dev/null 2>&1 || die 'go is required on PATH'
[ -n "$target_os" ] || target_os=$(go env GOHOSTOS)
[ -n "$target_arch" ] || target_arch=$(go env GOHOSTARCH)
case $target_os in darwin|linux) ;; *) die "unsupported --os: $target_os" 2 ;; esac
case $target_arch in arm64|amd64) ;; *) die "unsupported --arch: $target_arch" 2 ;; esac

archive="luuna-beacon_${version}_${target_os}_${target_arch}.tar.gz"
outputs="$archive LICENSE UPSTREAM.md provenance.json SHA256SUMS"

if [ -L "$out" ]; then die "--out must not be a symlink: $out" 2; fi
created_out=0
if [ -e "$out" ]; then
	[ -d "$out" ] || die "--out exists and is not a directory: $out" 2
	[ -z "$(ls -A "$out")" ] || die "--out must be empty: $out" 2
else
	mkdir -p "$out"
	created_out=1
fi
out=$(cd "$out" && pwd -P)

stage=''
finished=0
cleanup() {
	rc=$?
	trap - EXIT HUP INT TERM
	[ -z "$stage" ] || rm -rf "$stage"
	if [ "$finished" -ne 1 ]; then
		# Only the names this script writes; --out itself is never deleted recursively.
		for f in $outputs; do rm -f "$out/$f"; done
		if [ "$created_out" -eq 1 ]; then rmdir "$out" 2>/dev/null || :; fi
		[ "$rc" -ne 0 ] || rc=1
	fi
	exit "$rc"
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

script_dir=$(cd "$(dirname "$0")" && pwd -P)
repo=$(cd "$script_dir/../.." && pwd -P)
[ -f "$repo/go.mod" ] && [ -d "$repo/cmd/luuna-beacon" ] && [ -d "$repo/cmd/lbc" ] ||
	die "not a luuna-beacon checkout: $repo"

if command -v sha256sum >/dev/null 2>&1; then
	sha256() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
	sha256() { shasum -a 256 "$1" | awk '{print $1}'; }
else
	die 'sha256sum or shasum is required'
fi

umask 022
stage=$(mktemp -d "${TMPDIR:-/tmp}/luuna-beacon-package.XXXXXX")
mkdir "$stage/bin" "$stage/out"
dist=$stage/out

# cli.version is a Go const, so it cannot be overridden with -ldflags -X;
# only strip flags are passed. The archive version is recorded in provenance.
ldflags='-s -w'
buildflags="-trimpath -buildvcs=false -ldflags=$ldflags"
cd "$repo"
for cmd in luuna-beacon lbc; do
	CGO_ENABLED=0 GOOS=$target_os GOARCH=$target_arch \
		go build -trimpath -buildvcs=false -ldflags="$ldflags" -o "$stage/bin/$cmd" "./cmd/$cmd"
done

for cmd in luuna-beacon lbc; do
	chmod 0755 "$stage/bin/$cmd"
	touch -t 200001010000 "$stage/bin/$cmd"
done

# tar writes an intermediate file, so a tar failure stops the build instead of
# being masked by gzip's exit status at the end of a pipeline.
if tar --version 2>/dev/null | grep -q 'GNU tar'; then
	(cd "$stage" && tar --format=ustar --owner=0 --group=0 --numeric-owner \
		-cf "$stage/archive.tar" bin/luuna-beacon bin/lbc)
else
	(cd "$stage" && COPYFILE_DISABLE=1 tar --format ustar --uid 0 --gid 0 --uname root --gname root \
		--no-xattrs --no-mac-metadata -cf "$stage/archive.tar" bin/luuna-beacon bin/lbc)
fi
[ -s "$stage/archive.tar" ] || die 'tar produced no archive'
gzip -n -9 -c "$stage/archive.tar" >"$dist/$archive"

cp "$repo/LICENSE" "$dist/LICENSE"
cp "$repo/UPSTREAM.md" "$dist/UPSTREAM.md"

internal_version=$(sed -n 's/^const version = "\(.*\)"$/\1/p' "$repo/internal/cli/cli.go")
[ -n "$internal_version" ] || die 'could not read internal version from internal/cli/cli.go'

json_str() { printf '%s' "$1" | tr -d '\000-\037' | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'; }

# source.dirty covers tracked and untracked (non-ignored) changes, because
# go build compiles untracked .go files. It is null, never a guessed false,
# when Git is unavailable or the checkout is not the root of its own repository.
commit=unknown
dirty=null
if command -v git >/dev/null 2>&1 &&
	top=$(git -C "$repo" rev-parse --show-toplevel 2>/dev/null) &&
	[ -n "$top" ] && [ "$(cd "$top" 2>/dev/null && pwd -P)" = "$repo" ]; then
	commit=$(git -C "$repo" rev-parse --verify -q HEAD 2>/dev/null) || commit=unknown
	if st=$(git -C "$repo" status --porcelain --untracked-files=normal 2>/dev/null); then
		if [ -n "$st" ]; then dirty=true; else dirty=false; fi
	fi
fi
archive_sha=$(sha256 "$dist/$archive")

cat >"$dist/provenance.json" <<EOF
{
  "schema": "luuna-release-provenance/1",
  "attested": false,
  "component": "beacon",
  "archive_version": "$(json_str "$version")",
  "internal_version": "$(json_str "$internal_version")",
  "os": "$(json_str "$target_os")",
  "arch": "$(json_str "$target_arch")",
  "executables": ["luuna-beacon", "lbc"],
  "archive": {"name": "$(json_str "$archive")", "sha256": "$archive_sha"},
  "source": {
    "repository": "$(json_str "${GITHUB_REPOSITORY:-unknown}")",
    "commit": "$(json_str "$commit")",
    "dirty": $dirty,
    "ref": "$(json_str "${GITHUB_REF:-unknown}")"
  },
  "build": {
    "workflow_run_id": "$(json_str "${GITHUB_RUN_ID:-local}")",
    "runner_os": "$(json_str "$(uname -s)")",
    "runner_arch": "$(json_str "$(uname -m)")",
    "go_version": "$(json_str "$(go env GOVERSION)")",
    "gotoolchain": "$(json_str "${GOTOOLCHAIN:-}")",
    "cgo_enabled": "0",
    "flags": "$(json_str "$buildflags")"
  }
}
EOF

(cd "$dist" && for f in "$archive" LICENSE UPSTREAM.md provenance.json; do
	printf '%s  %s\n' "$(sha256 "$f")" "$f"
done) >"$dist/SHA256SUMS"

for f in $outputs; do
	[ -f "$dist/$f" ] || die "missing staged output: $f"
done
for f in $outputs; do
	mv "$dist/$f" "$out/$f"
done
finished=1
printf '%s\n' "$out/$archive"
