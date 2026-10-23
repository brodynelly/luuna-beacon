.PHONY: fmt test vet build verify

fmt:
	gofmt -w cmd internal

test:
	go test ./...

vet:
	go vet ./...

build:
	go build ./cmd/luuna-beacon ./cmd/lbc ./cmd/lb

verify: test vet build
