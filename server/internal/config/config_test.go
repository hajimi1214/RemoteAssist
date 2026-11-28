package config

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"io"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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
	if cfg.MaxMessageBytes != 65536 || cfg.RateLimitPerMinute != 120 || cfg.LoginFailLimit != 10 || cfg.ActiveSessionTTL != 8*time.Hour {
		t.Fatal("unsafe resource limit was accepted")
	}
}

func TestFromEnvDefaultsActiveSessionToWorkday(t *testing.T) {
	t.Setenv("SESSION_ACTIVE_TTL", "")
	if got := FromEnv().ActiveSessionTTL; got != 8*time.Hour {
		t.Fatalf("default active session TTL=%s, want 8h", got)
	}
}

func TestServerTLSConfigRequiresCertificateAndKeyTogether(t *testing.T) {
	cfg := Config{PublicBaseURL: "https://192.168.1.10:8443", TLSCertFile: "server.crt"}
	if _, err := cfg.ServerTLSConfig(); err == nil {
		t.Fatal("expected an incomplete TLS certificate pair to fail")
	}
}

func TestServerTLSConfigRequiresHTTPSRoot(t *testing.T) {
	now := time.Now()
	certFile, keyFile := writeTestServerCertificate(t, "192.168.1.10", now.Add(-time.Hour), now.Add(time.Hour))
	cfg := Config{PublicBaseURL: "http://192.168.1.10:8443", TLSCertFile: certFile, TLSKeyFile: keyFile}
	if _, err := cfg.ServerTLSConfig(); err == nil {
		t.Fatal("expected TLS to require an HTTPS public service URL")
	}
	cfg.PublicBaseURL = "https://192.168.1.10:8443/api"
	if _, err := cfg.ServerTLSConfig(); err == nil {
		t.Fatal("expected TLS to reject a non-root public service URL")
	}
}

func TestServerTLSConfigChecksCertificateNameAndValidity(t *testing.T) {
	t.Run("hostname mismatch", func(t *testing.T) {
		now := time.Now()
		certFile, keyFile := writeTestServerCertificate(t, "192.168.1.11", now.Add(-time.Hour), now.Add(time.Hour))
		cfg := Config{PublicBaseURL: "https://192.168.1.10:8443", TLSCertFile: certFile, TLSKeyFile: keyFile}
		if _, err := cfg.ServerTLSConfig(); err == nil {
			t.Fatal("expected a certificate for another IP to fail")
		}
	})

	t.Run("expired certificate", func(t *testing.T) {
		now := time.Now()
		certFile, keyFile := writeTestServerCertificate(t, "192.168.1.10", now.Add(-2*time.Hour), now.Add(-time.Hour))
		cfg := Config{PublicBaseURL: "https://192.168.1.10:8443", TLSCertFile: certFile, TLSKeyFile: keyFile}
		if _, err := cfg.ServerTLSConfig(); err == nil {
			t.Fatal("expected an expired certificate to fail")
		}
	})
}

func TestServerTLSConfigRejectsCAAndClientOnlyCertificates(t *testing.T) {
	t.Run("CA certificate", func(t *testing.T) {
		certFile, keyFile := writeTestCertificate(t, "192.168.1.10", time.Now().Add(-time.Hour), time.Now().Add(time.Hour), true, []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth})
		cfg := Config{PublicBaseURL: "https://192.168.1.10:8443", TLSCertFile: certFile, TLSKeyFile: keyFile}
		if _, err := cfg.ServerTLSConfig(); err == nil {
			t.Fatal("expected a CA certificate to be rejected as the TLS serving certificate")
		}
	})

	t.Run("client-only certificate", func(t *testing.T) {
		certFile, keyFile := writeTestCertificate(t, "192.168.1.10", time.Now().Add(-time.Hour), time.Now().Add(time.Hour), false, []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth})
		cfg := Config{PublicBaseURL: "https://192.168.1.10:8443", TLSCertFile: certFile, TLSKeyFile: keyFile}
		if _, err := cfg.ServerTLSConfig(); err == nil {
			t.Fatal("expected a client-only certificate to be rejected")
		}
	})
}

func TestServerTLSConfigAcceptsMatchingPrivateIPCertificate(t *testing.T) {
	now := time.Now()
	certFile, keyFile := writeTestServerCertificate(t, "192.168.1.10", now.Add(-time.Hour), now.Add(time.Hour))
	cfg := Config{PublicBaseURL: "https://192.168.1.10:8443", TLSCertFile: certFile, TLSKeyFile: keyFile}
	got, err := cfg.ServerTLSConfig()
	if err != nil {
		t.Fatalf("TLS configuration rejected matching certificate: %v", err)
	}
	if got.MinVersion != tls.VersionTLS12 || len(got.Certificates) != 1 {
		t.Fatalf("TLS config=%#v, want TLS 1.2 minimum and one server certificate", got)
	}
	if err := got.Certificates[0].Leaf.VerifyHostname("192.168.1.10"); err != nil {
		t.Fatalf("configured certificate does not match LAN IP: %v", err)
	}
}

func TestConfiguredTLSServerCompletesVerifiedHTTPSRequest(t *testing.T) {
	certFile, keyFile := writeTestServerCertificate(t, "192.168.1.10", time.Now().Add(-time.Hour), time.Now().Add(time.Hour))
	serverConfig, err := (Config{
		PublicBaseURL: "https://192.168.1.10:8443",
		TLSCertFile:   certFile,
		TLSKeyFile:    keyFile,
	}).ServerTLSConfig()
	if err != nil {
		t.Fatalf("configure test TLS server: %v", err)
	}

	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, "tls-ok")
	}))
	server.TLS = serverConfig
	server.StartTLS()
	t.Cleanup(server.Close)

	trustedRoots := x509.NewCertPool()
	trustedRoots.AddCert(serverConfig.Certificates[0].Leaf)
	transport := &http.Transport{TLSClientConfig: &tls.Config{
		MinVersion: tls.VersionTLS12,
		RootCAs:    trustedRoots,
		ServerName: "192.168.1.10",
	}}
	client := &http.Client{Transport: transport}
	t.Cleanup(transport.CloseIdleConnections)
	response, err := client.Get(server.URL)
	if err != nil {
		t.Fatalf("perform certificate-verified HTTPS request: %v", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatalf("read HTTPS response: %v", err)
	}
	if response.StatusCode != http.StatusOK || string(body) != "tls-ok" {
		t.Fatalf("HTTPS response status=%d body=%q", response.StatusCode, body)
	}
}

func TestServerTLSConfigDisabledWithoutCertificateFiles(t *testing.T) {
	got, err := (Config{PublicBaseURL: "https://assist.example.test"}).ServerTLSConfig()
	if err != nil || got != nil {
		t.Fatalf("TLS config=%#v, error=%v, want disabled without explicit certificate files", got, err)
	}
}

func writeTestServerCertificate(t *testing.T, host string, notBefore, notAfter time.Time) (string, string) {
	t.Helper()
	return writeTestCertificate(t, host, notBefore, notAfter, false, []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth})
}

func writeTestCertificate(t *testing.T, host string, notBefore, notAfter time.Time, isCA bool, usages []x509.ExtKeyUsage) (string, string) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{
		SerialNumber:          big.NewInt(1),
		Subject:               pkix.Name{CommonName: host},
		NotBefore:             notBefore,
		NotAfter:              notAfter,
		BasicConstraintsValid: true,
		IsCA:                  isCA,
		KeyUsage:              x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           usages,
		IPAddresses:           []net.IP{net.ParseIP(host)},
	}
	if isCA {
		template.KeyUsage |= x509.KeyUsageCertSign
	}
	certificate, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	privateKey, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	directory := t.TempDir()
	certFile := filepath.Join(directory, "server.crt")
	keyFile := filepath.Join(directory, "server.key")
	if err := os.WriteFile(certFile, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: certificate}), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(keyFile, pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: privateKey}), 0600); err != nil {
		t.Fatal(err)
	}
	return certFile, keyFile
}

func TestFromEnvReadsTURNRESTSettings(t *testing.T) {
	t.Setenv("STUN_URLS", " stun:stun.example.test:3478, stuns:stuns.example.test:5349 ")
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
	wantSTUNURLs := []string{"stun:stun.example.test:3478", "stuns:stuns.example.test:5349"}
	if len(cfg.ICEServers) != 1 || !reflect.DeepEqual(cfg.ICEServers[0].URLs, wantSTUNURLs) {
		t.Fatalf("STUN servers=%#v, want explicit configuration %#v", cfg.ICEServers, wantSTUNURLs)
	}
}

func TestFromEnvDoesNotUsePublicSTUNByDefault(t *testing.T) {
	t.Setenv("STUN_URLS", "")
	if got := FromEnv().ICEServers; len(got) != 0 {
		t.Fatalf("default STUN servers=%#v, want none", got)
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
