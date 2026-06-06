package database

import (
	"strings"
	"testing"
)

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
