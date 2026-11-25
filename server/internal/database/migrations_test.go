package database

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCaseInsensitiveUserIdentityMigrationPreflightsAndAddsUniqueIndexes(t *testing.T) {
	files, err := Files()
	if err != nil {
		t.Fatal(err)
	}
	if len(files) < 2 || files[0] != "migrations/001_init.sql" || files[1] != "migrations/002_case_insensitive_user_identity.sql" {
		t.Fatalf("unexpected migration order: %#v", files)
	}
	sql, err := migrationFS.ReadFile(files[1])
	if err != nil {
		t.Fatal(err)
	}
	mirroredSQL, err := os.ReadFile(filepath.Join("..", "..", "migrations", filepath.Base(files[1])))
	if err != nil {
		t.Fatal(err)
	}
	if string(mirroredSQL) != string(sql) {
		t.Fatal("inspection mirror differs from embedded migration source")
	}
	text := string(sql)
	for _, required := range []string{
		"GROUP BY lower(username)",
		"GROUP BY lower(email)",
		"case-insensitive duplicate usernames exist",
		"case-insensitive duplicate emails exist",
		"idx_users_username_lower_unique",
		"idx_users_email_lower_unique",
	} {
		if !strings.Contains(text, required) {
			t.Errorf("migration 002 missing %q", required)
		}
	}
}

func TestMigrationContainsRequiredTablesAndSensitiveExclusions(t *testing.T) {
	files, err := Files()
	if err != nil {
		t.Fatal(err)
	}
	if len(files) == 0 {
		t.Fatal("expected migrations")
	}
	content, err := migrationFS.ReadFile(files[0])
	if err != nil {
		t.Fatal(err)
	}
	sql := strings.ToLower(string(content))
	for _, table := range []string{"users", "devices", "refresh_tokens", "remote_sessions", "audit_logs"} {
		if !strings.Contains(sql, "create table if not exists "+table) {
			t.Fatalf("missing table %s", table)
		}
	}
	for _, prohibited := range []string{"screen_content", "screenshot", "keyboard_content", "turn_secret", "plain_password"} {
		if strings.Contains(sql, prohibited) {
			t.Fatalf("migration contains prohibited field %s", prohibited)
		}
	}
}
