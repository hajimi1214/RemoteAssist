package main

import (
	"context"
	"log"
	"os"
	"time"

	"remoteassist/server/internal/database"
	"remoteassist/server/internal/identity"
)

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		log.Fatal("DATABASE_URL is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	db, err := identity.OpenPostgres(ctx, databaseURL)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	if err := database.RunMigrations(ctx, db); err != nil {
		log.Fatal(err)
	}
	log.Print("migrations applied")
}
