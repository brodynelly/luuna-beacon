//go:build windows

package store

import "golang.org/x/sys/windows"

// MoveFileEx with REPLACE_EXISTING is the documented Windows replacement
// operation. os.Rename alone cannot replace an existing destination there.
func replaceFile(from, to string) error {
	return windows.MoveFileEx(
		windows.StringToUTF16Ptr(from),
		windows.StringToUTF16Ptr(to),
		windows.MOVEFILE_REPLACE_EXISTING|windows.MOVEFILE_WRITE_THROUGH,
	)
}
