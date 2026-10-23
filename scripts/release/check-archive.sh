#!/bin/sh
# Re-verify a Luuna Beacon release archive before trusting it.
#
#   sh scripts/release/check-archive.sh [--no-run | --require-run] ARCHIVE
#
# Checks, in order, without extracting anything until the listing is clean:
#   - file name is luuna-beacon_<version>_<darwin|linux>_<arm64|amd64>.tar.gz
#   - a regular (non-symlink) SHA256SUMS beside the archive lists it exactly
#     once, and the checksum matches (exit 4 otherwise)
#   - entries are exactly bin/luuna-beacon and bin/lbc, regular files, mode 0755
#     (no links, devices, directories, absolute paths or ".." segments)
# Then extracts into a private temp dir, re-checks the files, and, when the
# archive matches the host platform, runs --version/--help through both names
# and confirms the alias passes arguments through unchanged. --require-run
# fails (exit 6) instead of falling back to a structure-only check.
set -eu

die() { printf 'check-archive.sh: %s\n' "$1" >&2; exit "${2:-1}"; }

run=1
require_run=0
archive=''
while [ $# -gt 0 ]; do
	case $1 in
	--no-run) run=0; shift ;;
	--require-run) require_run=1; shift ;;
	-h|--help) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
	-*) die "unknown option: $1" 2 ;;
	*) [ -z "$archive" ] || die 'exactly one archive is required' 2; archive=$1; shift ;;
	esac
done
[ -n "$archive" ] || die 'exactly one archive is required' 2
[ "$run" -eq 1 ] || [ "$require_run" -eq 0 ] || die '--no-run and --require-run conflict' 2
[ -f "$archive" ] && [ ! -L "$archive" ] || die "not a regular file: $archive" 2

name=$(basename "$archive")
dir=$(cd "$(dirname "$archive")" && pwd -P)
rest=${name#luuna-beacon_}
[ "$rest" != "$name" ] || die "unexpected archive name: $name"
rest=${rest%.tar.gz}
[ "$rest" != "${name#luuna-beacon_}" ] || die "unexpected archive name: $name"
arch=${rest##*_}; rest=${rest%_*}
os=${rest##*_}; version=${rest%_*}
case $os in darwin|linux) ;; *) die "unexpected os in name: $name" ;; esac
case $arch in arm64|amd64) ;; *) die "unexpected arch in name: $name" ;; esac
case $version in ''|*[!0-9A-Za-z.-]*) die "unexpected version in name: $name" ;; esac

if command -v sha256sum >/dev/null 2>&1; then
	sha256() { sha256sum "$1" | awk '{print $1}'; }
elif command -v shasum >/dev/null 2>&1; then
	sha256() { shasum -a 256 "$1" | awk '{print $1}'; }
else
	die 'sha256sum or shasum is required to verify SHA256SUMS' 3
fi

sums=$dir/SHA256SUMS
[ -f "$sums" ] && [ ! -L "$sums" ] || die "SHA256SUMS missing beside $name (or not a regular file)" 4
count=$(awk -v n="$name" '$2 == n && NF == 2 {c++} END {print c + 0}' "$sums")
[ "$count" -ne 0 ] || die "SHA256SUMS does not list $name" 4
[ "$count" -eq 1 ] || die "SHA256SUMS lists $name $count times; want exactly one entry" 4
want=$(awk -v n="$name" '$2 == n && NF == 2 {print $1}' "$sums")
case $want in
*[!0-9a-f]*|'') die "SHA256SUMS entry for $name is not a lowercase hex digest" 4 ;;
esac
[ "${#want}" -eq 64 ] || die "SHA256SUMS entry for $name is not a SHA-256 digest" 4
[ "$want" = "$(sha256 "$archive")" ] || die "checksum mismatch for $name" 4

expected='bin/lbc
bin/luuna-beacon'
names=$(tar -tzf "$archive") || die 'archive is not a readable tar.gz' 5
sorted=$(printf '%s\n' "$names" | LC_ALL=C sort)
[ "$sorted" = "$expected" ] || die "archive entries must be exactly bin/luuna-beacon and bin/lbc; got: $(printf '%s' "$names" | tr '\n' ' ')" 5
modes=$(tar -tzvf "$archive" | awk '{print $1}' | LC_ALL=C sort -u)
[ "$modes" = '-rwxr-xr-x' ] || die "entries must be regular 0755 files; got modes: $(printf '%s' "$modes" | tr '\n' ' ')" 5

work=$(mktemp -d "${TMPDIR:-/tmp}/luuna-beacon-check.XXXXXX")
trap 'rm -rf "$work"' EXIT HUP INT TERM
(cd "$work" && tar -xzf "$dir/$name") || die 'extraction failed' 5
for cmd in luuna-beacon lbc; do
	f=$work/bin/$cmd
	[ -f "$f" ] && [ ! -L "$f" ] && [ -x "$f" ] || die "extracted bin/$cmd is not a regular executable" 5
done

host_os=$(uname -s | tr '[:upper:]' '[:lower:]')
case $(uname -m) in x86_64|amd64) host_arch=amd64 ;; aarch64|arm64) host_arch=arm64 ;; *) host_arch=$(uname -m) ;; esac
if [ "$run" -eq 1 ] && [ "$os" = "$host_os" ] && [ "$arch" = "$host_arch" ]; then
	v1=$("$work/bin/luuna-beacon" --version) || die 'luuna-beacon --version failed'
	v2=$("$work/bin/lbc" --version) || die 'lbc --version failed'
	[ -n "$v1" ] && [ "$v1" = "$v2" ] || die "version mismatch between names: '$v1' vs '$v2'"
	"$work/bin/luuna-beacon" --help >/dev/null || die 'luuna-beacon --help failed'
	"$work/bin/lbc" --help >/dev/null || die 'lbc --help failed'
	j1=$("$work/bin/luuna-beacon" --json --version) || die 'luuna-beacon --json --version failed'
	j2=$("$work/bin/lbc" --json --version) || die 'lbc --json --version failed'
	[ "$j1" = "$j2" ] || die 'lbc does not pass arguments through like luuna-beacon'
	printf 'ok %s (ran on host; internal version %s)\n' "$name" "$v1"
elif [ "$require_run" -eq 1 ]; then
	die "--require-run: $name is $os/$arch but host is $host_os/$host_arch" 6
else
	printf 'ok %s (structure only; not run on %s/%s)\n' "$name" "$host_os" "$host_arch"
fi
