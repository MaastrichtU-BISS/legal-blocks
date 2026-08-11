package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func newStore(t *testing.T) *FileStore {
	t.Helper()
	s, err := NewFileStore(t.TempDir())
	if err != nil {
		t.Fatalf("creating store: %v", err)
	}
	return s
}

func TestRoundTrip(t *testing.T) {
	s := newStore(t)

	if _, err := s.Get("annotate1.task"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("Get on a missing key = %v, want ErrNotFound", err)
	}

	want := json.RawMessage(`{"name":"Obligations","documents":[]}`)
	if err := s.Put("annotate1.task", want); err != nil {
		t.Fatalf("Put: %v", err)
	}
	got, err := s.Get("annotate1.task")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if string(got) != string(want) {
		t.Errorf("Get = %s, want %s", got, want)
	}

	keys, err := s.Keys()
	if err != nil {
		t.Fatalf("Keys: %v", err)
	}
	if len(keys) != 1 || keys[0] != "annotate1.task" {
		t.Errorf("Keys = %v, want [annotate1.task]", keys)
	}

	if err := s.Delete("annotate1.task"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
	if _, err := s.Get("annotate1.task"); !errors.Is(err, ErrNotFound) {
		t.Errorf("Get after Delete = %v, want ErrNotFound", err)
	}
	// Deleting something already gone is how a UI-driven delete behaves on a
	// retry, and must not be an error.
	if err := s.Delete("annotate1.task"); err != nil {
		t.Errorf("Delete of a missing key = %v, want nil", err)
	}
}

// Keys arrive from the browser, so they must never be able to address a file
// outside the data directory.
func TestRejectsUnsafeKeys(t *testing.T) {
	s := newStore(t)
	for _, key := range []string{
		"../escape",
		"nested/key",
		`..\windows`,
		"",
		".hidden",
		"with space",
	} {
		if err := s.Put(key, json.RawMessage(`{}`)); err == nil {
			t.Errorf("Put(%q) was allowed, want rejected", key)
		}
		if _, err := s.Get(key); err == nil {
			t.Errorf("Get(%q) was allowed, want rejected", key)
		}
	}
}

func TestRejectsNonJSON(t *testing.T) {
	s := newStore(t)
	if err := s.Put("k", json.RawMessage(`{not json`)); err == nil {
		t.Error("Put accepted invalid JSON, want rejected")
	}
}

// A failed write must not damage the value already stored — losing an
// annotator's saved work to a bad write is the failure this store exists to
// prevent.
func TestFailedWriteLeavesPreviousValueIntact(t *testing.T) {
	dir := t.TempDir()
	s, err := NewFileStore(dir)
	if err != nil {
		t.Fatalf("creating store: %v", err)
	}

	good := json.RawMessage(`{"annotations":1}`)
	if err := s.Put("k", good); err != nil {
		t.Fatalf("Put: %v", err)
	}
	if err := s.Put("k", json.RawMessage(`garbage`)); err == nil {
		t.Fatal("Put accepted invalid JSON, want rejected")
	}

	got, err := s.Get("k")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if string(got) != string(good) {
		t.Errorf("stored value = %s, want it unchanged as %s", got, good)
	}

	// The temp file used for the atomic write must not be left behind.
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("reading data dir: %v", err)
	}
	for _, e := range entries {
		if filepath.Ext(e.Name()) != ".json" {
			t.Errorf("stray file left in data directory: %s", e.Name())
		}
	}
}
