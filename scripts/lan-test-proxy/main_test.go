package main

import (
	"bytes"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"errors"
	"io"
	"log"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestListenAndBackendAreConstrained(t *testing.T) {
	for _, value := range []string{"0.0.0.0:8443", "127.0.0.1:8443", "8.8.8.8:8443", "[::]:8443", "192.168.0.100:443", "localhost:8443", "192.168.0.100:65536"} {
		if _, err := listenAddress(value); err == nil {
			t.Fatalf("unsafe listener accepted: %s", value)
		}
	}
	if _, err := listenAddress("192.168.0.100:8443"); err != nil {
		t.Fatal(err)
	}
	for _, value := range []string{"http://localhost:8080", "http://192.168.0.100:8080", "http://127.0.0.1", "http://user:pass@127.0.0.1:8080", "http://127.0.0.1:8080/api", "http://127.0.0.1:8080/?token=a", "https://127.0.0.1:8080"} {
		if _, err := backendURL(value); err == nil {
			t.Fatalf("unsafe backend accepted: %s", value)
		}
	}
	for _, value := range []string{"http://127.0.0.1:8080", "http://[::1]:8080"} {
		if _, err := backendURL(value); err != nil {
			t.Fatal(err)
		}
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestProxyPreservesAuthOriginButRemovesSpoofedForwarding(t *testing.T) {
	var logs bytes.Buffer
	target, _ := backendURL("http://127.0.0.1:8080")
	called := false
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		called = true
		if r.URL.Host != "127.0.0.1:8080" || r.Header.Get("Origin") != "https://tauri.localhost" || r.Header.Get("Authorization") != "Bearer test-only-value" {
			t.Fatal("routing or authentication headers changed")
		}
		if r.Header.Get("X-Forwarded-For") != "192.168.0.101" || r.Header.Get("Forwarded") != "" || r.Header.Get("X-Real-IP") != "" || r.Header.Get("X-Forwarded-Host") != "" || r.Header.Get("X-Forwarded-Proto") != "https" {
			t.Fatal("client forwarding metadata survived")
		}
		return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": {"application/json"}}, Body: io.NopCloser(strings.NewReader(`{"status":"ok"}`)), Request: r}, nil
	})
	handler := proxyHandler(target, transport, log.New(&logs, "", 0))
	req := httptest.NewRequest("GET", "https://192.168.0.100:8443/api/v1/admin/status?private=test", nil)
	req.RemoteAddr = "192.168.0.101:43210"
	req.Header.Set("Origin", "https://tauri.localhost")
	req.Header.Set("Authorization", "Bearer test-only-value")
	for _, name := range []string{"Forwarded", "X-Forwarded-For", "X-Forwarded-Host", "X-Forwarded-Proto", "X-Real-IP"} {
		req.Header.Set(name, "attacker-value")
	}
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, req)
	if !called || recorder.Code != 200 || logs.String() != "status=200\n" {
		t.Fatal("unexpected proxy result or unsafe log output")
	}
}

func TestErrorsNeverLogRequestContent(t *testing.T) {
	var logs bytes.Buffer
	target, _ := backendURL("http://127.0.0.1:8080")
	handler := proxyHandler(target, roundTripFunc(func(*http.Request) (*http.Response, error) {
		return nil, errors.New("error containing private-token-and-path")
	}), log.New(&logs, "", 0))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest("POST", "https://192.168.0.100:8443/api/v1/auth/login?secret=x", strings.NewReader("private-body")))
	if response.Code != 502 || logs.String() != "status=502\n" || strings.Contains(response.Body.String(), "private") {
		t.Fatal("proxy exposed details")
	}
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest("GET", "https://192.168.0.100:8443/private", nil))
	if response.Code != 404 {
		t.Fatal("unexpected path forwarded")
	}
}

func TestCertificateMustMatchIPAndValidity(t *testing.T) {
	now := time.Now()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatal(err)
	}
	template := &x509.Certificate{SerialNumber: big.NewInt(1), Subject: pkix.Name{CommonName: "LAN test"}, NotBefore: now.Add(-time.Minute), NotAfter: now.Add(time.Hour), IPAddresses: []net.IP{net.ParseIP("192.168.0.100")}, KeyUsage: x509.KeyUsageDigitalSignature, ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth}}
	der, err := x509.CreateCertificate(rand.Reader, template, template, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	certFile, keyFile := filepath.Join(dir, "cert.pem"), filepath.Join(dir, "key.pem")
	if err := os.WriteFile(certFile, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(keyFile, pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := loadTLS(certFile, keyFile, netip.MustParseAddr("192.168.0.100"), now); err != nil {
		t.Fatal(err)
	}
	if _, err := loadTLS(certFile, keyFile, netip.MustParseAddr("192.168.0.101"), now); err == nil {
		t.Fatal("wrong IP accepted")
	}
	if _, err := loadTLS(certFile, keyFile, netip.MustParseAddr("192.168.0.100"), now.Add(2*time.Hour)); err == nil {
		t.Fatal("expired certificate accepted")
	}
}
