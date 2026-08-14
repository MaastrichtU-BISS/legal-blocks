// Package serve holds what the composer and a platform both do: answer JSON,
// serve a single-page bundle, and run until stopped.
//
// They are two programs now, and neither should grow its own slightly
// different version of listening on a port.
package serve

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path"
	"strings"
	"syscall"
	"time"
)

// JSON writes a value as an API response.
func JSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Error writes a failure in the shape the frontend reads.
func Error(w http.ResponseWriter, status int, format string, args ...any) {
	JSON(w, status, map[string]string{"error": fmt.Sprintf(format, args...)})
}

// Static serves a built frontend bundle, falling back to index.html so that
// client-side routes survive a reload — which matters here, since "does my
// work survive a refresh?" is the question the whole store exists to answer.
func Static(bundle fs.FS) http.Handler {
	files := http.FileServer(http.FS(bundle))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if clean == "" {
			clean = "index.html"
		}
		if _, err := fs.Stat(bundle, clean); err != nil {
			r = r.Clone(r.Context())
			r.URL.Path = "/"
		}
		files.ServeHTTP(w, r)
	})
}

// Run listens and blocks until interrupted.
//
// The listener binds every interface rather than localhost. Both programs run
// inside a container now, where binding 127.0.0.1 would make the port
// unreachable from the machine the container is on — the published port would
// simply refuse connections, which looks exactly like a crashed program.
//
// That moves the access boundary out to the compose file, where the mapping
// reads "127.0.0.1:7777:7777" and is the thing to check if this ever needs
// discussing again. Neither program has a login: whatever can reach the port
// can read and write everyone's work.
func Run(name string, port int, handler http.Handler) error {
	ln, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", port))
	if err != nil {
		return fmt.Errorf("cannot listen on port %d: %w", port, err)
	}

	srv := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	fmt.Printf("\n  %s is running.\n\n  Open:  http://localhost:%d\n\n  Press Ctrl+C to stop.\n\n",
		name, ln.Addr().(*net.TCPAddr).Port)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	select {
	case err := <-errCh:
		return err
	case <-stop:
	}

	fmt.Println("\n  Stopping…")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return srv.Shutdown(ctx)
}
