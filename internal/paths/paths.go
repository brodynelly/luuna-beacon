package paths

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

func BeaconDir(cwd string) (string, error) {
	if err := MigrateLegacy(cwd); err != nil {
		return "", err
	}
	return filepath.Join(cwd, ".luuna", "beacon"), nil
}

func Config(cwd string) (string, error) {
	dir, err := BeaconDir(cwd)
	return filepath.Join(dir, "config.yaml"), err
}
func Prompts(cwd string) (string, error) {
	dir, err := BeaconDir(cwd)
	return filepath.Join(dir, "prompts.jsonl"), err
}
func Schemas(cwd string) (string, error) {
	dir, err := BeaconDir(cwd)
	return filepath.Join(dir, "schemas.jsonl"), err
}
func Artifacts(cwd string) (string, error) {
	dir, err := BeaconDir(cwd)
	return filepath.Join(dir, "artifacts.jsonl"), err
}

func MigrateLegacy(cwd string) error {
	legacy := filepath.Join(cwd, ".canopy")
	canonical := filepath.Join(cwd, ".luuna", "beacon")
	legacyInfo, err := os.Lstat(legacy)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if legacyInfo.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("refusing to migrate symlinked legacy directory")
	}
	if _, err := os.Stat(canonical); err == nil {
		return fmt.Errorf("both .canopy and .luuna/beacon exist; merge or remove one before continuing")
	}
	luuna := filepath.Join(cwd, ".luuna")
	if info, err := os.Lstat(luuna); err == nil && info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("refusing to migrate into symlinked .luuna directory")
	}
	if err := os.MkdirAll(luuna, 0o755); err != nil {
		return err
	}
	if err := os.Rename(legacy, canonical); err != nil {
		return err
	}
	for _, name := range []string{".gitattributes", ".gitignore"} {
		path := filepath.Join(cwd, name)
		content, readErr := os.ReadFile(path)
		if readErr != nil {
			continue
		}
		next := strings.ReplaceAll(string(content), ".canopy/", ".luuna/beacon/")
		if next != string(content) {
			if writeErr := os.WriteFile(path, []byte(next), 0o644); writeErr != nil {
				return writeErr
			}
		}
	}
	fmt.Fprintln(os.Stderr, "Migrated .canopy to .luuna/beacon")
	return nil
}
