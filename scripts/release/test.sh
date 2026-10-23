#!/bin/sh
# Offline tests for scripts/release/{package,check-archive}.sh.
#
#   sh scripts/release/test.sh            argument and fixture-archive tests only
#   sh scripts/release/test.sh --build    also package and check the host platform
#
# Fixture archives contain tiny #!/bin/sh stubs; no network is used. --build
# packages real binaries, including from a throwaway copy of the source tree
# (never the real checkout) to test provenance.
set -eu

here=$(cd "$(dirname "$0")" && pwd -P)
repo=$(cd "$here/../.." && pwd -P)
pkg=$here/package.sh
chk=$here/check-archive.sh
build=0
[ "${1:-}" = --build ] && build=1

tmp=$(mktemp -d "${TMPDIR:-/tmp}/luuna-beacon-release-test.XXXXXX")
trap 'rm -rf "$tmp"' EXIT HUP INT TERM
fails=0
n=0

expect() { # expect CODE NAME CMD...
	want=$1 label=$2; shift 2
	n=$((n + 1))
	set +e; "$@" >"$tmp/out" 2>&1; got=$?; set -e
	if { [ "$want" = nonzero ] && [ "$got" -ne 0 ]; } || [ "$want" = "$got" ]; then
		printf 'ok %d - %s\n' "$n" "$label"
	else
		printf 'not ok %d - %s (want %s, got %s)\n' "$n" "$label" "$want" "$got"
		sed 's/^/#   /' "$tmp/out"
		fails=$((fails + 1))
	fi
}

assert() { # assert NAME CMD...  (CMD exit status 0 passes)
	label=$1; shift
	n=$((n + 1))
	if "$@"; then
		printf 'ok %d - %s\n' "$n" "$label"
	else
		printf 'not ok %d - %s\n' "$n" "$label"; fails=$((fails + 1))
	fi
}

out_has() { grep -q "$1" "$tmp/out"; }

if command -v sha256sum >/dev/null 2>&1; then sha() { sha256sum "$1" | awk '{print $1}'; }
else sha() { shasum -a 256 "$1" | awk '{print $1}'; }; fi
host_os=$(uname -s | tr '[:upper:]' '[:lower:]')
case $(uname -m) in x86_64|amd64) host_arch=amd64; other_arch=arm64 ;; *) host_arch=arm64; other_arch=amd64 ;; esac

# --- package.sh argument validation (fails before building) ---
expect 2 'package: missing --version' sh "$pkg" --out "$tmp/o1"
expect 2 'package: missing --out' sh "$pkg" --version 1.0.0
expect 2 'package: --version without value' sh "$pkg" --version
expect 2 'package: two-part version' sh "$pkg" --version 1.0 --out "$tmp/o1"
expect 2 'package: leading v' sh "$pkg" --version v1.0.0 --out "$tmp/o1"
expect 2 'package: path in version' sh "$pkg" --version '1.0.0/../x' --out "$tmp/o1"
expect 2 'package: leading zero' sh "$pkg" --version 01.0.0 --out "$tmp/o1"
expect 2 'package: newline in version' sh "$pkg" --version "1.0.0
1.0.0" --out "$tmp/o1"
expect 2 'package: unknown argument' sh "$pkg" --version 1.0.0 --out "$tmp/o1" --sign
expect 2 'package: unsupported os' sh "$pkg" --version 1.0.0 --out "$tmp/o1" --os windows
expect 2 'package: unsupported arch' sh "$pkg" --version 1.0.0 --out "$tmp/o1" --arch riscv64
mkdir "$tmp/full"; : >"$tmp/full/keep"
expect 2 'package: non-empty --out' sh "$pkg" --version 1.0.0 --out "$tmp/full"
assert 'package: rejected non-empty --out left untouched' test "$(ls -A "$tmp/full")" = keep
: >"$tmp/afile"
expect 2 'package: --out is a file' sh "$pkg" --version 1.0.0 --out "$tmp/afile"
mkdir "$tmp/real"; ln -s "$tmp/real" "$tmp/link"
expect 2 'package: --out is a symlink' sh "$pkg" --version 1.0.0 --out "$tmp/link"
assert 'package: rejected runs did not create --out' test ! -e "$tmp/o1"
expect 0 'package: --help' sh "$pkg" --help

# --- check-archive.sh against fixtures ---
# mkfix NAME KIND [ARCH] -> $tmp/fx/NAME/luuna-beacon_1.0.0_<host os>_<ARCH>.tar.gz (+ SHA256SUMS)
mkfix() {
	d=$tmp/fx/$1; src=$d/src; mkdir -p "$src/bin"
	a=$d/luuna-beacon_1.0.0_${host_os}_${3:-$host_arch}.tar.gz
	for c in luuna-beacon lbc; do
		printf '#!/bin/sh\nprintf "%%s\\n" "stub $*"\n' >"$src/bin/$c"; chmod 0755 "$src/bin/$c"
	done
	printf 'bin/luuna-beacon\nbin/lbc\n' >"$d/list"
	case $2 in
	ok) ;;
	extra) printf 'x' >"$src/bin/evil"; chmod 0755 "$src/bin/evil"; echo bin/evil >>"$d/list" ;;
	symlink) rm "$src/bin/lbc"; ln -s luuna-beacon "$src/bin/lbc" ;;
	mode) chmod 0644 "$src/bin/lbc" ;;
	missing) echo bin/luuna-beacon >"$d/list" ;;
	dir) printf 'bin\nbin/luuna-beacon\nbin/lbc\n' >"$d/list" ;;
	traversal) mkdir -p "$src/x"; echo x/../bin/lbc >>"$d/list" ;;
	dup) echo bin/lbc >>"$d/list" ;;
	esac
	if tar --version 2>/dev/null | grep -q 'GNU tar'; then
		(cd "$src" && tar -cPf "$d/fx.tar" --no-recursion -T "$d/list")
	else
		(cd "$src" && COPYFILE_DISABLE=1 tar -cPf "$d/fx.tar" -n -T "$d/list")
	fi
	gzip -n -c "$d/fx.tar" >"$a"
	printf '%s  %s\n' "$(sha "$a")" "$(basename "$a")" >"$d/SHA256SUMS"
	printf '%s\n' "$a"
}

expect 0 'check: valid fixture runs both names' sh "$chk" "$(mkfix ok ok)"
expect 5 'check: extra entry rejected' sh "$chk" "$(mkfix extra extra)"
expect 5 'check: symlink entry rejected' sh "$chk" "$(mkfix symlink symlink)"
expect 5 'check: non-executable mode rejected' sh "$chk" "$(mkfix mode mode)"
expect 5 'check: missing executable rejected' sh "$chk" "$(mkfix missing missing)"
expect 5 'check: directory entry rejected' sh "$chk" "$(mkfix dir dir)"
expect 5 'check: dot-dot entry rejected' sh "$chk" "$(mkfix trav traversal)"
expect 5 'check: duplicate archive entry rejected' sh "$chk" "$(mkfix dupentry dup)"
a=$(mkfix sum ok); printf 'x' >>"$a"
expect 4 'check: checksum mismatch rejected' sh "$chk" "$a"
a=$(mkfix nosums ok); rm "$tmp/fx/nosums/SHA256SUMS"
expect 4 'check: missing SHA256SUMS rejected' sh "$chk" "$a"
assert 'check: missing SHA256SUMS reports the cause' out_has 'SHA256SUMS missing'
a=$(mkfix linksums ok); mv "$tmp/fx/linksums/SHA256SUMS" "$tmp/fx/linksums.sums"
ln -s "$tmp/fx/linksums.sums" "$tmp/fx/linksums/SHA256SUMS"
expect 4 'check: symlinked SHA256SUMS rejected' sh "$chk" "$a"
a=$(mkfix dupsum ok); cat "$tmp/fx/dupsum/SHA256SUMS" "$tmp/fx/dupsum/SHA256SUMS" >"$tmp/fx/dupsum.sums"
mv "$tmp/fx/dupsum.sums" "$tmp/fx/dupsum/SHA256SUMS"
expect 4 'check: duplicate SHA256SUMS entry rejected' sh "$chk" "$a"
assert 'check: duplicate SHA256SUMS entry reports the count' out_has 'exactly one entry'
a=$(mkfix unlisted ok); printf '%s  other.tar.gz\n' "$(sha "$a")" >"$tmp/fx/unlisted/SHA256SUMS"
expect 4 'check: archive not listed in SHA256SUMS rejected' sh "$chk" "$a"
a=$(mkfix badsum ok); printf 'XYZ  %s\n' "$(basename "$a")" >"$tmp/fx/badsum/SHA256SUMS"
expect 4 'check: malformed digest rejected' sh "$chk" "$a"

# PATH without sha256sum/shasum: an explicit tool error, not a checksum mismatch.
mkdir "$tmp/nosha"
for t in awk basename dirname gzip mktemp rm sed sort tar tr uname; do
	p=$(command -v "$t") && ln -s "$p" "$tmp/nosha/$t"
done
expect 3 'check: missing checksum tool is explicit' env PATH="$tmp/nosha" /bin/sh "$chk" "$(mkfix notool ok)"
assert 'check: missing checksum tool names the tools' out_has 'sha256sum or shasum is required'

a=$(mkfix name ok); mv "$a" "$tmp/fx/name/luuna-beacon_1.0.0_windows_amd64.tar.gz"
expect 1 'check: unsupported platform name rejected' sh "$chk" "$tmp/fx/name/luuna-beacon_1.0.0_windows_amd64.tar.gz"
expect 2 'check: no archive argument' sh "$chk"
expect 2 'check: --no-run conflicts with --require-run' sh "$chk" --no-run --require-run "$(mkfix conflict ok)"
expect 0 'check: --require-run passes on host fixture' sh "$chk" --require-run "$(mkfix reqhost ok)"
assert 'check: --require-run ran the host fixture' out_has 'ran on host'
a=$(mkfix foreign ok "$other_arch")
expect 0 'check: foreign arch is structure-only by default' sh "$chk" "$a"
expect 6 'check: --require-run rejects a foreign arch' sh "$chk" --require-run "$a"

# --- real host builds ---
dirty_of() { awk -F'"dirty": ' 'NF > 1 { split($2, v, ","); print v[1] }' "$1/provenance.json"; }

if [ "$build" -eq 1 ]; then
	hostname=luuna-beacon_0.0.0-test_${host_os}_${host_arch}.tar.gz
	expect 0 'package: host build' sh "$pkg" --version 0.0.0-test --out "$tmp/dist"
	expect 0 'check: host archive runs on host' sh "$chk" --require-run "$tmp/dist/$hostname"
	sums_ok() {
		(cd "$tmp/dist" && [ "$(wc -l <SHA256SUMS | tr -d ' ')" = 4 ] &&
			for f in $(awk '{print $2}' SHA256SUMS); do
				[ "$(awk -v f="$f" '$2 == f {print $1}' SHA256SUMS)" = "$(sha "$f")" ] || exit 1
			done) &&
			grep -q '"archive_version": "0.0.0-test"' "$tmp/dist/provenance.json" &&
			grep -q '"internal_version": "[0-9]' "$tmp/dist/provenance.json"
	}
	assert 'package: SHA256SUMS and provenance versions' sums_ok
	dirty_known() { case $(dirty_of "$tmp/dist") in true|false|null) return 0 ;; esac; return 1; }
	assert 'package: provenance dirty is true, false or null' dirty_known

	# Reproducibility: the same source in different local time zones.
	expect 0 'package: build with TZ=America/Los_Angeles' env TZ=America/Los_Angeles sh "$pkg" --version 0.0.0-test --out "$tmp/tz1"
	expect 0 'package: build with TZ=Asia/Tokyo' env TZ=Asia/Tokyo sh "$pkg" --version 0.0.0-test --out "$tmp/tz2"
	same_archive() {
		[ "$(sha "$tmp/tz1/$hostname")" = "$(sha "$tmp/tz2/$hostname")" ] &&
			[ "$(sha "$tmp/tz1/$hostname")" = "$(sha "$tmp/dist/$hostname")" ]
	}
	assert 'package: archive bytes identical across time zones' same_archive

	# A failing tar must fail the build and leave no partial outputs.
	mkdir "$tmp/badtar"
	printf '#!/bin/sh\necho "fake tar failure" >&2\nexit 2\n' >"$tmp/badtar/tar"; chmod 0755 "$tmp/badtar/tar"
	expect nonzero 'package: failing tar fails the build' env PATH="$tmp/badtar:$PATH" sh "$pkg" --version 0.0.0-test --out "$tmp/tarfail-new"
	assert 'package: failed build removed the --out it created' test ! -e "$tmp/tarfail-new"
	mkdir "$tmp/tarfail-empty"
	expect nonzero 'package: failing tar into existing --out' env PATH="$tmp/badtar:$PATH" sh "$pkg" --version 0.0.0-test --out "$tmp/tarfail-empty"
	assert 'package: failed build left existing --out empty' test -d "$tmp/tarfail-empty" -a -z "$(ls -A "$tmp/tarfail-empty")"

	# Provenance from a throwaway copy of the source tree.
	src=$tmp/srccopy
	mkdir -p "$src/scripts/release"
	for f in go.mod go.sum LICENSE UPSTREAM.md cmd internal; do cp -R "$repo/$f" "$src/$f"; done
	cp "$pkg" "$src/scripts/release/package.sh"
	GIT_CEILING_DIRECTORIES=$tmp
	export GIT_CEILING_DIRECTORIES
	expect 0 'package: build from a copy without Git metadata' sh "$src/scripts/release/package.sh" --version 0.0.0-test --out "$tmp/prov-nogit"
	assert 'package: no Git repository reports dirty null' test "$(dirty_of "$tmp/prov-nogit")" = null
	assert 'package: no Git repository reports commit unknown' grep -q '"commit": "unknown"' "$tmp/prov-nogit/provenance.json"
	if command -v git >/dev/null 2>&1; then
		g() { git -C "$src" -c user.name=release-test -c user.email=release-test@example.invalid \
			-c commit.gpgsign=false -c core.hooksPath=/dev/null "$@" >/dev/null 2>&1; }
		g init -q && g add -A && g commit -q -m fixture
		expect 0 'package: build from a clean committed copy' sh "$src/scripts/release/package.sh" --version 0.0.0-test --out "$tmp/prov-clean"
		assert 'package: clean copy reports dirty false' test "$(dirty_of "$tmp/prov-clean")" = false
		printf 'package cli\n\nconst untrackedReleaseTest = 1\n' >"$src/internal/cli/zz_untracked_release_test.go"
		expect 0 'package: build with an untracked Go source file' sh "$src/scripts/release/package.sh" --version 0.0.0-test --out "$tmp/prov-untracked"
		assert 'package: untracked Go source reports dirty true' test "$(dirty_of "$tmp/prov-untracked")" = true
	else
		n=$((n + 1)); printf 'not ok %d - package: git unavailable, dirty true/false provenance untested\n' "$n"; fails=$((fails + 1))
	fi
fi

if [ "$fails" -ne 0 ]; then printf '%d of %d failed\n' "$fails" "$n"; exit 1; fi
printf 'all %d passed\n' "$n"
