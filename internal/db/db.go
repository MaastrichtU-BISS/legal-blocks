// Package db is the platform's shared database.
//
// Modules read and write here instead of handing values to each other. What
// travels along a pipeline edge is now a reference — a dataset id, a task id —
// not a payload, so two modules looking at "the same task" are looking at the
// same rows rather than at two copies that can drift.
//
// SQLite via modernc.org/sqlite, which is a pure-Go implementation. That
// matters more than it looks: the usual driver needs cgo, and cgo would end
// cross-compilation and with it the ability to export a platform that runs on
// a colleague's Windows machine.
package db

import (
	"context"
	"database/sql"
	_ "embed"
	"fmt"

	_ "modernc.org/sqlite"
)

//go:embed schema.sql
var schema string

// DB is a handle on the platform's database.
type DB struct {
	sql *sql.DB
}

// Open opens (creating if needed) the database at path and applies the schema.
//
// The schema is applied with CREATE TABLE statements that assume an empty
// database, so it runs only when there are no tables yet. There is no
// migration machinery: at proof-of-concept stage a schema change means
// deleting data/platform.db, and pretending otherwise would be machinery
// nobody has needed yet.
func Open(path string) (*DB, error) {
	// _pragma arguments are applied to every connection in the pool, which
	// matters for foreign_keys: SQLite defaults it to OFF per connection, so
	// setting it once on one connection would silently leave the constraints
	// unenforced on the others.
	dsn := path + "?_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)"
	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("opening database: %w", err)
	}
	if err := sqlDB.Ping(); err != nil {
		sqlDB.Close()
		return nil, fmt.Errorf("opening database: %w", err)
	}

	d := &DB{sql: sqlDB}
	if err := d.applySchema(); err != nil {
		sqlDB.Close()
		return nil, err
	}
	return d, nil
}

func (d *DB) applySchema() error {
	var count int
	err := d.sql.QueryRow(
		`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'users'`,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("inspecting database: %w", err)
	}
	if count > 0 {
		return nil
	}
	if _, err := d.sql.Exec(schema); err != nil {
		return fmt.Errorf("creating schema: %w", err)
	}
	return nil
}

// Close releases the database.
func (d *DB) Close() error { return d.sql.Close() }

// tx runs fn in a transaction, rolling back on error.
//
// Saving one assignment touches four tables; without a transaction a failure
// halfway through would leave an annotator's document holding some of their
// spans and none of their relations.
func (d *DB) tx(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := d.sql.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("starting transaction: %w", err)
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}
