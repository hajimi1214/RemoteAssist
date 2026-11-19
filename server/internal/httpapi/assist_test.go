package httpapi

import (
	"errors"
	"fmt"
	"regexp"
	"sync"
	"testing"
	"time"
)

func TestAssistHubMergesConcurrentPendingRequests(t *testing.T) {
	hub := newAssistHub()
	start := make(chan struct{})
	results := make(chan assistRequest, 32)
	errors := make(chan error, 32)
	var wg sync.WaitGroup
	for i := 0; i < 32; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			request, err := hub.create("host", "controller", "Controller PC")
			results <- request
			errors <- err
		}()
	}
	close(start)
	wg.Wait()
	close(results)
	close(errors)
	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
	var id string
	for request := range results {
		if id == "" {
			id = request.ID
		}
		if id != request.ID {
			t.Fatal("concurrent requests created duplicate prompts for one device pair")
		}
	}
	if !regexp.MustCompile(`^asr_[a-f0-9]{32}$`).MatchString(id) || len(hub.pendingForHost("host")) != 1 {
		t.Fatal("expected one request with an opaque random ID")
	}
}

func TestAssistHubExpiresPendingRequestsForAllOperations(t *testing.T) {
	for _, operation := range []string{"pending", "lookup", "resolve", "create"} {
		t.Run(operation, func(t *testing.T) {
			now := time.Date(2026, 11, 19, 0, 0, 0, 0, time.UTC)
			hub := newAssistHub(assistHubConfig{TTL: time.Minute, GlobalLimit: 1, Now: func() time.Time { return now }})
			request, err := hub.create("host", "controller", "Controller")
			if err != nil {
				t.Fatal(err)
			}
			now = now.Add(time.Minute)
			switch operation {
			case "pending":
				if got := hub.pendingForHost("host"); len(got) != 0 {
					t.Fatal("pending returned an expired prompt")
				}
			case "lookup":
				if _, ok := hub.lookup(request.ID); ok {
					t.Fatal("lookup returned an expired prompt")
				}
			case "resolve":
				if _, ok := hub.resolve(request.ID, "host", "ACCEPTED"); ok {
					t.Fatal("resolve accepted an expired prompt")
				}
			case "create":
				created, err := hub.create("host", "controller", "Controller")
				if err != nil || created.ID == request.ID {
					t.Fatalf("expired request prevented fresh request: %v", err)
				}
			}
			if _, exists := hub.requests[request.ID]; exists {
				t.Fatal("expired prompt retained in request map")
			}
		})
	}
}

func TestAssistHubEnforcesGlobalAndPerHostLimits(t *testing.T) {
	hub := newAssistHub(assistHubConfig{GlobalLimit: 3, PerHostLimit: 2})
	for _, pair := range [][2]string{{"host-a", "controller-1"}, {"host-a", "controller-2"}} {
		if _, err := hub.create(pair[0], pair[1], "Controller"); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := hub.create("host-a", "controller-3", "Controller"); !errors.Is(err, ErrAssistRequestLimit) {
		t.Fatalf("expected per-host limit, got %v", err)
	}
	if _, err := hub.create("host-a", "controller-1", "Controller"); err != nil {
		t.Fatalf("duplicate pending request should still merge at limit: %v", err)
	}
	if _, err := hub.create("host-b", "controller-3", "Controller"); err != nil {
		t.Fatal(err)
	}
	if _, err := hub.create("host-c", "controller-4", "Controller"); !errors.Is(err, ErrAssistRequestLimit) {
		t.Fatalf("expected global limit, got %v", err)
	}
}

func TestAssistHubConcurrentCreatesCannotExceedLimit(t *testing.T) {
	hub := newAssistHub(assistHubConfig{GlobalLimit: 7, PerHostLimit: 7})
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, _ = hub.create("host", fmt.Sprint("controller-", i), "Controller")
		}(i)
	}
	wg.Wait()
	if got := len(hub.pendingForHost("host")); got != 7 {
		t.Fatalf("concurrent create count=%d, want limit 7", got)
	}
}

func TestAssistHubRetainsResolvedRequestBrieflyAndThenReclaimsIt(t *testing.T) {
	now := time.Date(2026, 11, 19, 0, 0, 0, 0, time.UTC)
	hub := newAssistHub(assistHubConfig{ResolvedRetention: time.Minute, Now: func() time.Time { return now }})
	request, err := hub.create("host", "controller", "Controller")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := hub.resolve(request.ID, "wrong-host", "ACCEPTED"); ok {
		t.Fatal("wrong host resolved request")
	}
	if _, ok := hub.resolve(request.ID, "host", "ACCEPTED"); !ok {
		t.Fatal("host could not resolve pending request")
	}
	if len(hub.pendingForHost("host")) != 0 {
		t.Fatal("resolved request was returned as pending")
	}
	if _, ok := hub.resolve(request.ID, "host", "REJECTED"); ok {
		t.Fatal("resolved request transitioned twice")
	}
	if _, ok := hub.lookup(request.ID); !ok {
		t.Fatal("resolved request was not retained for repeated-response handling")
	}
	now = now.Add(time.Minute)
	if _, ok := hub.lookup(request.ID); ok {
		t.Fatal("resolved request was retained beyond its retention window")
	}
}
