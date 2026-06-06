package config

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Addr               string
	PublicBaseURL      string
	CodeTTL            time.Duration
	MaxMessageBytes    int64
	RateLimitPerMinute int
	LogLevel           slog.Level
	ICEServers         []ICEServer
}

type ICEServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

func FromEnv() Config {
	return Config{
		Addr:               env("SIGNALING_ADDR", ":8080"),
		PublicBaseURL:      env("PUBLIC_BASE_URL", "http://localhost:8080"),
		CodeTTL:            durationEnv("SESSION_CODE_TTL", 5*time.Minute),
		MaxMessageBytes:    int64(intEnv("WS_MAX_MESSAGE_BYTES", 65536)),
		RateLimitPerMinute: intEnv("RATE_LIMIT_PER_MINUTE", 120),
		LogLevel:           levelEnv("LOG_LEVEL", slog.LevelInfo),
		ICEServers:         iceServersFromEnv(),
	}
}

func iceServersFromEnv() []ICEServer {
	servers := []ICEServer{{URLs: []string{"stun:stun.l.google.com:19302"}}}
	turnURLs := splitCSV(os.Getenv("TURN_URLS"))
	if len(turnURLs) == 0 {
		return servers
	}
	servers = append(servers, ICEServer{
		URLs:       turnURLs,
		Username:   os.Getenv("TURN_USERNAME"),
		Credential: os.Getenv("TURN_PASSWORD"),
	})
	return servers
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
