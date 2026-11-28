package config

import (
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr               string
	PublicBaseURL      string
	TLSCertFile        string
	TLSKeyFile         string
	CodeTTL            time.Duration
	ActiveSessionTTL   time.Duration
	MaxMessageBytes    int64
	RateLimitPerMinute int
	LoginFailLimit     int
	LogLevel           slog.Level
	DatabaseURL        string
	JWTSecret          string
	RefreshTokenSecret string
	AccessTokenTTL     time.Duration
	RefreshTokenTTL    time.Duration
	DeviceOfflineAfter time.Duration
	ICEServers         []ICEServer
	TURNURLs           []string
	TURNSecret         string
	TURNCredentialTTL  time.Duration
	TrustedProxyCIDRs  []*net.IPNet
	AppOrigins         []string
}

type ICEServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

func FromEnv() Config {
	databaseURL := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	allowEphemeralSecrets := databaseURL == ""
	return Config{
		Addr:               env("SIGNALING_ADDR", ":8080"),
		PublicBaseURL:      env("PUBLIC_BASE_URL", "http://localhost:8080"),
		TLSCertFile:        strings.TrimSpace(os.Getenv("TLS_CERT_FILE")),
		TLSKeyFile:         strings.TrimSpace(os.Getenv("TLS_KEY_FILE")),
		CodeTTL:            durationEnv("SESSION_CODE_TTL", 5*time.Minute),
		ActiveSessionTTL:   boundedDurationEnv("SESSION_ACTIVE_TTL", 8*time.Hour, time.Minute, 8*time.Hour),
		MaxMessageBytes:    int64(boundedIntEnv("WS_MAX_MESSAGE_BYTES", 65536, 1024, 262144)),
		RateLimitPerMinute: boundedIntEnv("RATE_LIMIT_PER_MINUTE", 120, 1, 10000),
		LoginFailLimit:     boundedIntEnv("LOGIN_FAIL_LIMIT_PER_MINUTE", 10, 1, 100),
		LogLevel:           levelEnv("LOG_LEVEL", slog.LevelInfo),
		DatabaseURL:        databaseURL,
		JWTSecret:          secretEnv("JWT_SECRET", allowEphemeralSecrets),
		RefreshTokenSecret: secretEnv("REFRESH_TOKEN_SECRET", allowEphemeralSecrets),
		AccessTokenTTL:     durationEnv("ACCESS_TOKEN_TTL", 15*time.Minute),
		RefreshTokenTTL:    durationEnv("REFRESH_TOKEN_TTL", 30*24*time.Hour),
		DeviceOfflineAfter: durationEnv("DEVICE_OFFLINE_AFTER", 2*time.Minute),
		ICEServers:         []ICEServer{{URLs: []string{"stun:stun.l.google.com:19302"}}},
		TURNURLs:           splitCSV(os.Getenv("TURN_URLS")),
		TURNSecret:         strings.TrimSpace(os.Getenv("TURN_SECRET")),
		TURNCredentialTTL:  boundedDurationEnv("TURN_CREDENTIAL_TTL", 10*time.Minute, time.Minute, 24*time.Hour),
		TrustedProxyCIDRs:  cidrsEnv("TRUSTED_PROXY_CIDRS"),
		AppOrigins:         appOriginsEnv(),
	}
}

func (c Config) ServerTLSConfig() (*tls.Config, error) {
	certFile := strings.TrimSpace(c.TLSCertFile)
	keyFile := strings.TrimSpace(c.TLSKeyFile)
	if certFile == "" && keyFile == "" {
		return nil, nil
	}
	if certFile == "" || keyFile == "" {
		return nil, errors.New("TLS_CERT_FILE and TLS_KEY_FILE must be configured together")
	}

	publicURL, err := url.Parse(strings.TrimSpace(c.PublicBaseURL))
	if err != nil || publicURL.Scheme != "https" || publicURL.Hostname() == "" || publicURL.User != nil || publicURL.Opaque != "" || (publicURL.Path != "" && publicURL.Path != "/") || publicURL.RawQuery != "" || publicURL.Fragment != "" {
		return nil, errors.New("PUBLIC_BASE_URL must be an HTTPS service root when TLS is enabled")
	}

	certificate, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return nil, fmt.Errorf("load TLS certificate and key: %w", err)
	}
	leaf, err := x509.ParseCertificate(certificate.Certificate[0])
	if err != nil {
		return nil, fmt.Errorf("parse TLS leaf certificate: %w", err)
	}
	hasBasicConstraints := false
	for _, extension := range leaf.Extensions {
		if extension.Id.Equal([]int{2, 5, 29, 19}) {
			hasBasicConstraints = true
			break
		}
	}
	if !hasBasicConstraints || leaf.IsCA {
		return nil, errors.New("TLS server certificate must not be a certificate authority")
	}
	serverAuthentication := false
	for _, usage := range leaf.ExtKeyUsage {
		if usage == x509.ExtKeyUsageServerAuth || usage == x509.ExtKeyUsageAny {
			serverAuthentication = true
			break
		}
	}
	if !serverAuthentication {
		return nil, errors.New("TLS leaf certificate must allow server authentication")
	}
	if leaf.KeyUsage&x509.KeyUsageDigitalSignature == 0 {
		return nil, errors.New("TLS leaf certificate must allow digital signatures")
	}
	now := time.Now()
	if now.Before(leaf.NotBefore) || !now.Before(leaf.NotAfter) {
		return nil, errors.New("TLS leaf certificate is not currently valid")
	}
	if err := leaf.VerifyHostname(publicURL.Hostname()); err != nil {
		return nil, fmt.Errorf("TLS leaf certificate does not match PUBLIC_BASE_URL: %w", err)
	}
	certificate.Leaf = leaf

	return &tls.Config{
		MinVersion:   tls.VersionTLS12,
		Certificates: []tls.Certificate{certificate},
	}, nil
}

func env(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func intEnv(key string, fallback int) int {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := strconv.Atoi(raw)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func boundedIntEnv(key string, fallback, minimum, maximum int) int {
	value := intEnv(key, fallback)
	if value < minimum || value > maximum {
		return fallback
	}
	return value
}

func durationEnv(key string, fallback time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	value, err := time.ParseDuration(raw)
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func boundedDurationEnv(key string, fallback, minimum, maximum time.Duration) time.Duration {
	value := durationEnv(key, fallback)
	if value < minimum || value > maximum {
		return fallback
	}
	return value
}

func levelEnv(key string, fallback slog.Level) slog.Level {
	switch strings.ToLower(strings.TrimSpace(os.Getenv(key))) {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	case "info":
		return slog.LevelInfo
	default:
		return fallback
	}
}

func splitCSV(value string) []string {
	var out []string
	for _, part := range strings.Split(value, ",") {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func cidrsEnv(key string) []*net.IPNet {
	var out []*net.IPNet
	for _, value := range splitCSV(os.Getenv(key)) {
		_, network, err := net.ParseCIDR(value)
		if err == nil {
			out = append(out, network)
		}
	}
	return out
}

func DefaultAppOrigins() []string {
	return []string{
		"http://tauri.localhost",
		"https://tauri.localhost",
		"tauri://localhost",
		"http://localhost:1420",
		"http://127.0.0.1:1420",
	}
}

func appOriginsEnv() []string {
	raw, configured := os.LookupEnv("APP_ORIGINS")
	if !configured {
		return DefaultAppOrigins()
	}
	var out []string
	seen := make(map[string]struct{})
	for _, value := range splitCSV(raw) {
		origin, ok := NormalizeAppOrigin(value)
		if !ok {
			continue
		}
		if _, exists := seen[origin]; exists {
			continue
		}
		seen[origin] = struct{}{}
		out = append(out, origin)
	}
	return out
}

func NormalizeAppOrigin(value string) (string, bool) {
	u, err := url.Parse(strings.TrimSpace(value))
	if err != nil || u.Scheme == "" || u.Host == "" || u.User != nil || u.Opaque != "" || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return "", false
	}
	scheme := strings.ToLower(u.Scheme)
	if scheme != "http" && scheme != "https" && scheme != "tauri" {
		return "", false
	}
	hostname := strings.ToLower(u.Hostname())
	if hostname == "" {
		return "", false
	}
	port := u.Port()
	if (scheme == "http" && port == "80") || (scheme == "https" && port == "443") {
		port = ""
	}
	host := hostname
	if strings.Contains(hostname, ":") {
		host = "[" + hostname + "]"
	}
	if port != "" {
		host = net.JoinHostPort(hostname, port)
	}
	return scheme + "://" + host, true
}

func IsAllowedAppOrigin(value string, allowed []string) bool {
	origin, ok := NormalizeAppOrigin(value)
	if !ok {
		return false
	}
	for _, candidate := range allowed {
		normalized, valid := NormalizeAppOrigin(candidate)
		if valid && origin == normalized {
			return true
		}
	}
	return false
}

func secretEnv(key string, allowEphemeral bool) string {
	value := strings.TrimSpace(os.Getenv(key))
	if len(value) >= 32 {
		return value
	}
	if !allowEphemeral {
		return value
	}
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return ""
	}
	return base64.RawURLEncoding.EncodeToString(buf)
}
