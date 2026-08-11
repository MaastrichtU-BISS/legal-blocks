// Package store is the exported platform's persistence: JSON documents on
// disk, next to the binary.
//
// Server-side rather than in the browser on purpose. It survives a cache
// clear, it can be inspected and emailed when something looks wrong, and it is
// the same seam a hosted database will occupy later — Store is a small enough
// interface that a Postgres implementation is a drop-in, and it is where
// per-user scoping lands once there is a login.
package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
)

// ErrNotFound is returned by Get for a key that was never written.
var ErrNotFound = errors.New("key not found")

// Store is the persistence contract. Values are opaque JSON.
type Store interface {
	Get(key string) (json.RawMessage, error)
	Put(key string, value json.RawMessage) error
	Delete(key string) error
	Keys() ([]string, error)
}

// keyPattern constrains keys to a flat, filesystem-safe namespace. Keys come
// from the frontend as "<nodeId>.<name>" (e.g. "annotate1.task"), so path
// separators are never legitimate and rejecting them outright removes any
// question of traversal.
var keyPattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$`)

// FileStore keeps one JSON file per key in a directory.
//
// Writes are whole-value: saving one annotation assignment rewrites its
// task document. That is fine at proof-of-concept sizes and keeps the format
// something you can open in a text editor; a per-assignment layout is the
// first thing to change if a task ever gets large.
type FileStore struct {
	dir string
	mu  sync.RWMutex
}

// NewFileStore creates the directory if needed and returns a store over it.
func NewFileStore(dir string) (*FileStore, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("creating data directory: %w", err)
	}
	return &FileStore{dir: dir}, nil
}

func (s *FileStore) path(key string) (string, error) {
	if !keyPattern.MatchString(key) {
		return "", fmt.Errorf("invalid key %q", key)
	}
	return filepath.Join(s.dir, key+".json"), nil
}

// Get returns the stored value, or ErrNotFound.
func (s *FileStore) Get(key string) (json.RawMessage, error) {
	p, err := s.path(key)
	if err != nil {
		return nil, err
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	raw, err := os.ReadFile(p)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", key, err)
	}
	return raw, nil
}

// Put writes the value, replacing any previous one. The write goes to a
// temporary file first so an interrupted save cannot leave a half-written
// document behind — losing an annotator's work to a crash mid-save is exactly
// the failure this store exists to prevent.
func (s *FileStore) Put(key string, value json.RawMessage) error {
	p, err := s.path(key)
	if err != nil {
		return err
	}
	if !json.Valid(value) {
		return fmt.Errorf("value for %q is not valid JSON", key)
	}
	s.mu.Lock()
	defer s.mu.Unlock()

	tmp, err := os.CreateTemp(s.dir, ".tmp-*")
	if err != nil {
		return fmt.Errorf("creating temp file: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	if _, err := tmp.Write(value); err != nil {
		tmp.Close()
		return fmt.Errorf("writing %s: %w", key, err)
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return fmt.Errorf("syncing %s: %w", key, err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("closing %s: %w", key, err)
	}
	if err := os.Rename(tmpName, p); err != nil {
		return fmt.Errorf("saving %s: %w", key, err)
	}
	return nil
}

// Delete removes a key. Deleting a key that does not exist is not an error.
func (s *FileStore) Delete(key string) error {
	p, err := s.path(key)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := os.Remove(p); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("deleting %s: %w", key, err)
	}
	return nil
}

// Keys lists stored keys in sorted order.
func (s *FileStore) Keys() ([]string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		return nil, fmt.Errorf("listing data directory: %w", err)
	}
	var keys []string
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".json") {
			continue
		}
		keys = append(keys, strings.TrimSuffix(name, ".json"))
	}
	sort.Strings(keys)
	return keys, nil
}
