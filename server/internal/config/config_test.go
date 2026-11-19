package config

import (
	"net"
	"reflect"
	"testing"
	"time"

	"remoteassist/server/internal/identity"
)

func TestResourceLimitsRejectExtremeEnvironmentValues(t *testing.T) {
	t.Setenv("WS_MAX_MESSAGE_BYTES", "2147483647")
	t.Setenv("RATE_LIMIT_PER_MINUTE", "2147483647")
	t.Setenv("LOGIN_FAIL_LIMIT_PER_MINUTE", "2147483647")
	t.Setenv("SESSION_ACTIVE_TTL", "900h")
	cfg := FromEnv()
	if cfg.MaxMessageBytes != 65536 || cfg.RateLimitPerMinute != 120 || cfg.LoginFailLimit != 10 || cfg.ActiveSessionTTL != 30*time.Minute {
		t.Fatal("unsafe resource limit was accepted")
	}
}

func TestFromEnvReadsTURNRESTSettings(t *testing.T) {
	t.Setenv("TURN_URLS", " turn:turn.example.test:3478?transport=udp, turns:turn.example.test:5349 ")
	t.Setenv("TURN_SECRET", "rest-shared-secret-long-enough-32")
	t.Setenv("TURN_CREDENTIAL_TTL", "7m")
	// Static credentials are intentionally ignored; only the shared REST
	// secret is used to mint short-lived credentials per authenticated request.
	t.Setenv("TURN_USERNAME", "static-user")
	t.Setenv("TURN_PASSWORD", "static-password")

	cfg := FromEnv()
	wantURLs := []string{"turn:turn.example.test:3478?transport=udp", "turns:turn.example.test:5349"}
	if !reflect.DeepEqual(cfg.TURNURLs, wantURLs) {
		t.Fatalf("TURN URLs=%#v, want %#v", cfg.TURNURLs, wantURLs)
	}
	if cfg.TURNSecret != "rest-shared-secret-long-enough-32" {
		t.Fatalf("TURN secret was not loaded from TURN_SECRET")
	}
	if cfg.TURNCredentialTTL != 7*time.Minute {
		t.Fatalf("TURN credential TTL=%s, want 7m", cfg.TURNCredentialTTL)
	}
	if len(cfg.ICEServers) != 1 || len(cfg.ICEServers[0].URLs) != 1 || cfg.ICEServers[0].URLs[0] != "stun:stun.l.google.com:19302" {
		t.Fatalf("default STUN server missing from config: %#v", cfg.ICEServers)
	}
}

func TestFromEnvDefaultsTURNCredentialTTL(t *testing.T) {
	t.Setenv("TURN_URLS", "")
	t.Setenv("TURN_SECRET", "")
	t.Setenv("TURN_CREDENTIAL_TTL", "invalid")
	if got := FromEnv().TURNCredentialTTL; got != 10*time.Minute {
		t.Fatalf("default TURN credential TTL=%s, want 10m", got)
	}
}

func TestFromEnvRejectsOutOfRangeTURNCredentialTTL(t *testing.T) {
	for _, value := range []string{"30s", "24h1m", "invalid"} {
		t.Run(value, func(t *testing.T) {
			t.Setenv("TURN_CREDENTIAL_TTL", value)
			if got := FromEnv().TURNCredentialTTL; got != 10*time.Minute {
				t.Fatalf("TURN credential TTL=%s for %q, want default 10m", got, value)
			}
		})
	}
	for _, value := range []string{"1m", "24h"} {
		t.Run("valid_"+value, func(t *testing.T) {
			t.Setenv("TURN_CREDENTIAL_TTL", value)
			if got, want := FromEnv().TURNCredentialTTL, mustDuration(t, value); got != want {
				t.Fatalf("TURN credential TTL=%s, want %s", got, want)
			}
		})
	}
}

func TestDatabaseConfigurationRequiresConfiguredStrongAuthSecrets(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://user:pass@localhost/db")
	for _, test := range []struct {
		name    string
		jwt     string
		refresh string
	}{
		{name: "missing", jwt: "", refresh: ""},
		{name: "weak", jwt: "short", refresh: "also-short"},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("JWT_SECRET", test.jwt)
			t.Setenv("REFRESH_TOKEN_SECRET", test.refresh)
			cfg := FromEnv()
			if cfg.JWTSecret != test.jwt || cfg.RefreshTokenSecret != test.refresh {
				t.Fatal("database-backed configuration must not replace missing/weak secrets with random values")
			}
			if _, err := identity.NewService(identity.NewMemoryStore(), identity.ServiceConfig{AccessSecret: cfg.JWTSecret, RefreshSecret: cfg.RefreshTokenSecret}); err == nil {
				t.Fatal("expected service startup validation to reject missing/weak secrets")
			}
		})
	}
}

func TestLocalConfigurationMayGenerateEphemeralAuthSecrets(t *testing.T) {
	t.Setenv("DATABASE_URL", "")
	t.Setenv("JWT_SECRET", "")
	t.Setenv("REFRESH_TOKEN_SECRET", "")
	cfg := FromEnv()
	if len(cfg.JWTSecret) < 32 || len(cfg.RefreshTokenSecret) < 32 {
		t.Fatal("expected local dev configuration to use ephemeral strong secrets")
	}
}

func mustDuration(t *testing.T, value string) time.Duration {
	t.Helper()
	duration, err := time.ParseDuration(value)
	if err != nil {
		t.Fatal(err)
	}
	return duration
}

func TestFromEnvParsesOnlyValidTrustedProxyCIDRs(t *testing.T) {
	t.Setenv("TRUSTED_PROXY_CIDRS", "172.16.0.0/12, 10.0.0.0/8, invalid")
	cfg := FromEnv()
	if len(cfg.TrustedProxyCIDRs) != 2 {
		t.Fatalf("trusted proxy CIDR count=%d, want 2 valid CIDRs", len(cfg.TrustedProxyCIDRs))
	}
	if !cfg.TrustedProxyCIDRs[0].Contains(net.ParseIP("172.16.5.10")) || !cfg.TrustedProxyCIDRs[1].Contains(net.ParseIP("10.2.3.4")) {
		t.Fatalf("trusted proxy ranges were not parsed correctly: %#v", cfg.TrustedProxyCIDRs)
	}
}

func TestAppOriginsUseDefaultsAndRejectUnsafeValues(t *testing.T) {
	defaults := DefaultAppOrigins()
	if len(defaults) != 5 {
		t.Fatalf("default app origins=%#v, want five desktop/dev origins", defaults)
	}
	t.Setenv("APP_ORIGINS", "https://app.example.com, https://APP.example.com/, *, https://app.example.com/path, tauri://localhost")
	cfg := FromEnv()
	want := []string{"https://app.example.com", "tauri://localhost"}
	if !reflect.DeepEqual(cfg.AppOrigins, want) {
		t.Fatalf("app origins=%#v, want %#v", cfg.AppOrigins, want)
	}
}
