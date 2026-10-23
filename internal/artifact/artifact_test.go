package artifact

import (
	"os"
	"path/filepath"
	"testing"
)

func TestArtifactManifestHashAndVerification(t *testing.T) {
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, "SKILL.md"), []byte("# Example\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	files, err := Snapshot("skill", "example", dir)
	if err != nil {
		t.Fatal(err)
	}
	record := New("skill", "example", files, 1)
	if err := Verify(record); err != nil {
		t.Fatalf("new artifact must verify: %v", err)
	}
	record.Files[0].Content = "changed"
	if err := Verify(record); err == nil {
		t.Fatal("tampered artifact verified")
	}
}

func TestArtifactNameValidation(t *testing.T) {
	if _, err := Snapshot("skill", "Uppercase", t.TempDir()); err == nil {
		t.Fatal("invalid artifact name accepted")
	}
}
