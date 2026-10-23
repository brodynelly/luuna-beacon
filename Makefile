.PHONY: fmt test vet build verify release-test release-local

fmt:
	gofmt -w cmd internal

test:
	go test ./...

vet:
	go vet ./...

build:
	go build ./cmd/luuna-beacon ./cmd/lbc ./cmd/lb

verify: test vet build

VERSION ?= 0.0.0-local
OUT ?= dist/release-local

release-test:
	sh scripts/release/test.sh --build

# Host-platform archive for local dry runs; OUT must be new or empty.
release-local:
	sh scripts/release/package.sh --version $(VERSION) --out $(OUT)
	sh scripts/release/check-archive.sh --require-run $(OUT)/luuna-beacon_$(VERSION)_$$(go env GOHOSTOS)_$$(go env GOHOSTARCH).tar.gz
