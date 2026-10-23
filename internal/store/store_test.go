package store

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAtomicWriteReplacesExistingFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "record.jsonl")
	if err := os.WriteFile(path, []byte("old\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := AtomicWrite(path, []byte("new\n")); err != nil {
		t.Fatal(err)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(got) != "new\n" {
		t.Fatalf("content = %q, want replacement", got)
	}
}

func TestAppendJSONLRewritesAndPreservesHistory(t *testing.T) {
	path := filepath.Join(t.TempDir(), "records.jsonl")
	if err := AppendJSONL(path, map[string]int{"version": 1}); err != nil {
		t.Fatal(err)
	}
	if err := AppendJSONL(path, map[string]int{"version": 2}); err != nil {
		t.Fatal(err)
	}
	records, err := ReadJSONL[map[string]int](path)
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 2 || records[0]["version"] != 1 || records[1]["version"] != 2 {
		t.Fatalf("unexpected records: %#v", records)
	}
}
