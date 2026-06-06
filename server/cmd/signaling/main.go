package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"remoteassist/server/internal/config"
	"remoteassist/server/internal/database"
	"remoteassist/server/internal/httpapi"
	"remoteassist/server/internal/identity"
	"remoteassist/server/internal/session"
)

func main() {
	cfg := config.FromEnv()
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: cfg.LogLevel}))
	store := session.NewStore(session.StoreConfig{
		CodeTTL:         cfg.CodeTTL,
		CleanupInterval: 30 * time.Second,
		Now:             time.Now,
	})
	identityStore, db, err := identityStoreFromConfig(context.Background(), cfg, logger)
	if err != nil {
		logger.Error("identity store initialization failed", "error", err)
		os.Exit(1)
	}
	if db != nil {
		defer db.Close()
	}
	identityService, err := identity.NewService(identityStore, identity.ServiceConfig{
		AccessSecret:       cfg.JWTSecret,
		RefreshSecret:      cfg.RefreshTokenSecret,
		AccessTTL:          cfg.AccessTokenTTL,
		RefreshTTL:         cfg.RefreshTokenTTL,
		DeviceOfflineAfter: cfg.DeviceOfflineAfter,
		Now:                time.Now,
	})
	if err != nil {
		logger.Error("identity service initialization failed", "error", err)
		os.Exit(1)
	}

	app := httpapi.NewServer(cfg, store, logger, identityService)
	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           app.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       10 * time.Second,
		WriteTimeout:      15 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		logger.Info("signaling server started", "addr", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("signaling server failed", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	store.Stop()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful shutdown failed", "error", err)
		os.Exit(1)
	}
	logger.Info("signaling server stopped")
}

func identityStoreFromConfig(ctx context.Context, cfg config.Config, logger *slog.Logger) (identity.Store, *sql.DB, error) {
	if cfg.DatabaseURL == "" {
		logger.Warn("DATABASE_URL is not set; using in-memory auth/device store")
		return identity.NewMemoryStore(), nil, nil
	}
	db, err := identity.OpenPostgres(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, nil, err
	}
	if err := database.RunMigrations(ctx, db); err != nil {
		_ = db.Close()
		return nil, nil, err
	}
	return identity.NewPostgresStore(db), db, nil
}
