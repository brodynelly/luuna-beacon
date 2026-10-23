package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	lockStale   = 30 * time.Second
	lockRetry   = 50 * time.Millisecond
	lockTimeout = 5 * time.Second
)

type Lock struct{ path string }

func (lock *Lock) Release() { _ = os.Remove(lock.path) }

func Acquire(path string) (*Lock, error) {
	lockPath := path + ".lock"
	deadline := time.Now().Add(lockTimeout)
	for time.Now().Before(deadline) {
		file, err := os.OpenFile(lockPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if err == nil {
			_ = file.Close()
			return &Lock{path: lockPath}, nil
		}
		if !errors.Is(err, os.ErrExist) {
			return nil, fmt.Errorf("acquire lock %s: %w", lockPath, err)
		}
		if info, statErr := os.Stat(lockPath); statErr == nil && time.Since(info.ModTime()) > lockStale {
			_ = os.Remove(lockPath)
			continue
		}
		time.Sleep(lockRetry)
	}
	return nil, fmt.Errorf("timeout acquiring lock on %s after %dms", path, lockTimeout.Milliseconds())
}

func AtomicWrite(path string, content []byte) error {
	directory := filepath.Dir(path)
	temp, err := os.CreateTemp(directory, ".tmp.*")
	if err != nil {
		return fmt.Errorf("create temporary file: %w", err)
	}
	tempPath := temp.Name()
	defer os.Remove(tempPath)
	if _, err = temp.Write(content); err == nil {
		err = temp.Sync()
	}
	if closeErr := temp.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return fmt.Errorf("write temporary file: %w", err)
	}
	if err = replaceFile(tempPath, path); err != nil {
		return fmt.Errorf("atomically replace %s: %w", path, err)
	}
	return nil
}

func ReadJSONL[T any](path string) ([]T, error) {
	content, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	items := []T{}
	for number, line := range strings.Split(string(content), "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		var item T
		if err := json.Unmarshal([]byte(line), &item); err != nil {
			return nil, fmt.Errorf("invalid JSONL line %d in %s: %w", number+1, path, err)
		}
		items = append(items, item)
	}
	return items, nil
}

func AppendJSONL[T any](path string, item T) error {
	lock, err := Acquire(path)
	if err != nil {
		return err
	}
	defer lock.Release()
	encoded, err := json.Marshal(item)
	if err != nil {
		return err
	}
	existing, err := os.ReadFile(path)
	if err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	content := append([]byte{}, existing...)
	content = append(content, encoded...)
	content = append(content, '\n')
	return AtomicWrite(path, content)
}
