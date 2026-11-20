// A foreground-only TLS endpoint for a local RemoteAssist test service.
package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/netip"
	"net/url"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"time"
)

func listenAddress(value string) (netip.Addr, error) {
	host, portText, err := net.SplitHostPort(value)
	if err != nil {
		return netip.Addr{}, errors.New("listen must be a private IPv4 address and port")
	}
	ip, err := netip.ParseAddr(host)
	port, portErr := strconv.Atoi(portText)
	if err != nil || !ip.Is4() || !ip.IsPrivate() || portErr != nil || port < 1024 || port > 65535 {
		return netip.Addr{}, errors.New("listen must use one RFC1918 IPv4 address and port 1024-65535")
	}
	return ip, nil
}

func backendURL(value string) (*url.URL, error) {
	u, err := url.Parse(value)
	if err != nil || u.Scheme != "http" || u.User != nil || u.Opaque != "" || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
		return nil, errors.New("backend must be an HTTP origin on a literal loopback address")
	}
	ip, err := netip.ParseAddr(u.Hostname())
	port, portErr := strconv.Atoi(u.Port())
	if err != nil || !ip.IsLoopback() || portErr != nil || port < 1 || port > 65535 {
		return nil, errors.New("backend must be an HTTP origin on a literal loopback address with an explicit port")
	}
	return u, nil
}

func loadTLS(certFile, keyFile string, ip netip.Addr, now time.Time) (*tls.Config, error) {
	pair, err := tls.LoadX509KeyPair(certFile, keyFile)
	if err != nil {
		return nil, errors.New("cannot load matching LAN certificate and private key")
	}
	leaf, err := x509.ParseCertificate(pair.Certificate[0])
	if err != nil || leaf.IsCA || now.Before(leaf.NotBefore) || !now.Before(leaf.NotAfter) {
		return nil, errors.New("LAN certificate must be an unexpired server certificate")
	}
	if err := leaf.VerifyHostname(ip.String()); err != nil {
		return nil, errors.New("LAN certificate IP SAN does not match the requested listener")
	}
	return &tls.Config{MinVersion: tls.VersionTLS12, Certificates: []tls.Certificate{pair}}, nil
}

func proxyHandler(target *url.URL, transport http.RoundTripper, logger *log.Logger) http.Handler {
	proxy := &httputil.ReverseProxy{
		Transport: transport,
		Rewrite: func(r *httputil.ProxyRequest) {
			// Do not trust client-supplied forwarding metadata. Preserve Origin and
			// Authorization so the signaling service retains its own access checks.
			r.Out.Header.Del("Forwarded")
			r.Out.Header.Del("X-Forwarded-For")
			r.Out.Header.Del("X-Forwarded-Host")
			r.Out.Header.Del("X-Forwarded-Proto")
			r.Out.Header.Del("X-Real-IP")
			r.SetURL(target)
			if host, _, err := net.SplitHostPort(r.In.RemoteAddr); err == nil {
				if ip, err := netip.ParseAddr(host); err == nil {
					r.Out.Header.Set("X-Forwarded-For", ip.String())
				}
			}
			r.Out.Header.Set("X-Forwarded-Proto", "https")
		},
		ModifyResponse: func(response *http.Response) error {
			// Paths, query strings, headers and bodies can carry session data.
			logger.Printf("status=%d", response.StatusCode)
			return nil
		},
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, _ error) {
			logger.Print("status=502")
			http.Error(w, "local signaling service unavailable", http.StatusBadGateway)
		},
		ErrorLog: log.New(sanitizedLogWriter{logger}, "", 0),
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		if r.URL.Path != "/healthz" && !strings.HasPrefix(r.URL.Path, "/api/v1/") {
			logger.Print("status=404")
			http.NotFound(w, r)
			return
		}
		proxy.ServeHTTP(w, r)
	})
}

// Standard-library network errors sometimes embed request paths. Avoid logging
// them: health/status checks give enough information for this temporary helper.
type sanitizedLogWriter struct{ logger *log.Logger }

func (w sanitizedLogWriter) Write(data []byte) (int, error) {
	w.logger.Print("status=transport_error")
	return len(data), nil
}

func run() error {
	addr := flag.String("listen", "", "required private IPv4:port, e.g. 192.168.0.100:8443")
	backend := flag.String("backend", "http://127.0.0.1:8080", "literal loopback HTTP origin")
	certFile := flag.String("cert", "", "IP-SAN server certificate PEM")
	keyFile := flag.String("key", "", "matching server private key PEM")
	flag.Parse()
	ip, err := listenAddress(*addr)
	if err != nil {
		return err
	}
	target, err := backendURL(*backend)
	if err != nil {
		return err
	}
	config, err := loadTLS(*certFile, *keyFile, ip, time.Now())
	if err != nil {
		return err
	}
	logger := log.New(os.Stdout, "", log.LstdFlags)
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil // The loopback backend must never be sent through a proxy.
	transport.ResponseHeaderTimeout = 15 * time.Second
	srv := &http.Server{
		Addr: *addr, Handler: proxyHandler(target, transport, logger), TLSConfig: config,
		ReadHeaderTimeout: 5 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 16 * 1024,
		ErrorLog: log.New(sanitizedLogWriter{logger}, "", 0),
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	logger.Print("status=starting")
	if err := srv.ListenAndServeTLS("", ""); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return errors.New("LAN TLS listener could not start or stopped unexpectedly")
	}
	logger.Print("status=stopped")
	return nil
}

func main() {
	if err := run(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
