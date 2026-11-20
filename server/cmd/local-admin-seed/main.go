package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"os"
	"remoteassist/server/internal/identity"
	"strings"
)

func main() {
	username := flag.String("username", "", "local preview administrator username")
	email := flag.String("email", "", "local preview account email")
	output := flag.String("output", "", "new seed file path; existing files are never overwritten")
	flag.Parse()
	if *output == "" {
		fail("output path is required")
	}
	// Password is read from stdin, never a command-line flag or log.
	data, err := io.ReadAll(io.LimitReader(os.Stdin, 1026))
	if err != nil {
		fail("cannot read password")
	}
	password := strings.TrimRight(string(data), "\r\n")
	seed, err := identity.NewLocalAdminSeed(*username, *email, password)
	for i := range data {
		data[i] = 0
	}
	if err != nil {
		fail("invalid local administrator input")
	}
	file, err := os.OpenFile(*output, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		fail("cannot create seed file")
	}
	if err := json.NewEncoder(file).Encode(seed); err != nil {
		file.Close()
		fail("cannot write seed file")
	}
	if err := file.Close(); err != nil {
		fail("cannot finish seed file")
	}
	fmt.Println("Local preview administrator seed created; no plaintext password saved.")
}

func fail(message string) { fmt.Fprintln(os.Stderr, message); os.Exit(1) }
