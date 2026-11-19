package database

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"fmt"
	"io"
	"strings"
	"sync"
	"testing"
)

func TestRunMigrationsSkipsAppliedVersions(t *testing.T) {
	state := newMigrationDriverState()
	files, err := Files()
	if err != nil {
		t.Fatal(err)
	}
	for _, file := range files {
		state.applied[file] = true
	}
	db := openMigrationTestDB(t, state)
	if err := RunMigrations(context.Background(), db); err != nil {
		t.Fatal(err)
	}
	if state.scriptAttempts != 0 || state.commits != 1 || state.lockAcquisitions != 1 {
		t.Fatalf("already-applied migration executed: attempts=%d commits=%d locks=%d", state.scriptAttempts, state.commits, state.lockAcquisitions)
	}
}

func TestRunMigrationsIsSafeToRepeat(t *testing.T) {
	state := newMigrationDriverState()
	db := openMigrationTestDB(t, state)
	for i := 0; i < 2; i++ {
		if err := RunMigrations(context.Background(), db); err != nil {
			t.Fatal(err)
		}
	}
	files, err := Files()
	if err != nil {
		t.Fatal(err)
	}
	if state.scriptAttempts != len(files) || len(state.applied) != len(files) || state.commits != 2 {
		t.Fatalf("repeat replayed migration: attempts=%d versions=%d commits=%d", state.scriptAttempts, len(state.applied), state.commits)
	}
}

func TestRunMigrationsRollsBackSchemaAndVersionOnFailure(t *testing.T) {
	for _, failure := range []string{"script", "version"} {
		t.Run(failure, func(t *testing.T) {
			state := newMigrationDriverState()
			state.fail = failure
			db := openMigrationTestDB(t, state)
			if err := RunMigrations(context.Background(), db); err == nil {
				t.Fatal("expected migration failure")
			}
			if state.commits != 0 || state.rollbacks != 1 || len(state.applied) != 0 || len(state.committedScripts) != 0 {
				t.Fatalf("failure committed partial migration: commits=%d rollbacks=%d versions=%d scripts=%d", state.commits, state.rollbacks, len(state.applied), len(state.committedScripts))
			}
			state.fail = ""
			if err := RunMigrations(context.Background(), db); err != nil {
				t.Fatalf("retry after rollback failed: %v", err)
			}
			if state.commits != 1 || len(state.applied) == 0 || len(state.committedScripts) == 0 {
				t.Fatal("successful retry did not apply the migration")
			}
		})
	}
}

func TestRunMigrationsSerializesConcurrentRunners(t *testing.T) {
	state := newMigrationDriverState()
	db := openMigrationTestDB(t, state)
	start := make(chan struct{})
	errors := make(chan error, 2)
	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			errors <- RunMigrations(context.Background(), db)
		}()
	}
	close(start)
	wg.Wait()
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
	files, err := Files()
	if err != nil {
		t.Fatal(err)
	}
	if state.lockAcquisitions != 2 || state.scriptAttempts != len(files) || len(state.applied) != len(files) {
		t.Fatalf("parallel runners replayed migrations: locks=%d scripts=%d versions=%d", state.lockAcquisitions, state.scriptAttempts, len(state.applied))
	}
}

// This driver models transactional schema/version changes and the database-wide
// advisory lock, so tests detect both script replay and partial commit bugs.
type migrationDriverState struct {
	mu               sync.Mutex
	advisory         sync.Mutex
	applied          map[string]bool
	committedScripts []string
	scriptAttempts   int
	commits          int
	rollbacks        int
	lockAcquisitions int
	fail             string
}

func newMigrationDriverState() *migrationDriverState {
	return &migrationDriverState{applied: map[string]bool{}}
}

func openMigrationTestDB(t *testing.T, state *migrationDriverState) *sql.DB {
	t.Helper()
	db := sql.OpenDB(migrationConnector{state})
	t.Cleanup(func() { _ = db.Close() })
	return db
}

type migrationConnector struct{ state *migrationDriverState }

func (c migrationConnector) Connect(context.Context) (driver.Conn, error) {
	return &migrationConn{state: c.state}, nil
}

func (c migrationConnector) Driver() driver.Driver { return migrationDriver{c.state} }

type migrationDriver struct{ state *migrationDriverState }

func (d migrationDriver) Open(string) (driver.Conn, error) {
	return &migrationConn{state: d.state}, nil
}

type migrationConn struct {
	state *migrationDriverState
	tx    *migrationTx
}

func (c *migrationConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("prepare unsupported")
}

func (c *migrationConn) Close() error { return nil }

func (c *migrationConn) Begin() (driver.Tx, error) {
	return c.BeginTx(context.Background(), driver.TxOptions{})
}

func (c *migrationConn) BeginTx(_ context.Context, options driver.TxOptions) (driver.Tx, error) {
	if options.Isolation != driver.IsolationLevel(sql.LevelReadCommitted) {
		return nil, fmt.Errorf("migration requires read committed isolation, got %d", options.Isolation)
	}
	c.tx = &migrationTx{conn: c, applied: map[string]bool{}}
	return c.tx, nil
}

func (c *migrationConn) ExecContext(_ context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	if c.tx == nil {
		return nil, errors.New("migration statement executed outside transaction")
	}
	switch {
	case strings.HasPrefix(query, "SELECT pg_advisory_xact_lock"):
		if len(args) != 1 || args[0].Value != migrationLockKey {
			return nil, errors.New("unexpected migration lock key")
		}
		c.state.advisory.Lock()
		c.tx.locked = true
		c.state.mu.Lock()
		c.state.lockAcquisitions++
		for version, applied := range c.state.applied {
			c.tx.applied[version] = applied
		}
		c.state.mu.Unlock()
	case !c.tx.locked:
		return nil, errors.New("migration statement executed before advisory lock")
	case strings.HasPrefix(query, "CREATE TABLE IF NOT EXISTS schema_migrations"):
	case strings.HasPrefix(query, "INSERT INTO schema_migrations"):
		if c.state.fail == "version" {
			return nil, errors.New("injected version-write failure")
		}
		version := args[0].Value.(string)
		if c.tx.applied[version] {
			return nil, errors.New("duplicate migration version")
		}
		c.tx.applied[version] = true
	default:
		c.state.scriptAttempts++
		if c.state.fail == "script" {
			return nil, errors.New("injected script failure")
		}
		c.tx.scripts = append(c.tx.scripts, query)
	}
	return driver.RowsAffected(1), nil
}

func (c *migrationConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	if c.tx == nil || !c.tx.locked || !strings.HasPrefix(query, "SELECT EXISTS") {
		return nil, errors.New("unexpected migration query")
	}
	return &migrationRows{applied: c.tx.applied[args[0].Value.(string)]}, nil
}

type migrationTx struct {
	conn    *migrationConn
	locked  bool
	applied map[string]bool
	scripts []string
}

func (tx *migrationTx) Commit() error {
	state := tx.conn.state
	state.mu.Lock()
	state.applied = tx.applied
	state.committedScripts = append(state.committedScripts, tx.scripts...)
	state.commits++
	state.mu.Unlock()
	tx.release()
	return nil
}

func (tx *migrationTx) Rollback() error {
	tx.conn.state.mu.Lock()
	tx.conn.state.rollbacks++
	tx.conn.state.mu.Unlock()
	tx.release()
	return nil
}

func (tx *migrationTx) release() {
	tx.conn.tx = nil
	if tx.locked {
		tx.locked = false
		tx.conn.state.advisory.Unlock()
	}
}

type migrationRows struct {
	applied bool
	done    bool
}

func (*migrationRows) Columns() []string { return []string{"exists"} }
func (*migrationRows) Close() error      { return nil }
func (r *migrationRows) Next(dest []driver.Value) error {
	if r.done {
		return io.EOF
	}
	r.done = true
	dest[0] = r.applied
	return nil
}
