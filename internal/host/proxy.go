package host

import (
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/pipeline"
)

// The platform forwards /api/proxy/<id>/ to the outside APIs its modules
// depend on, attaching each one's credential on the way out.
//
// The point is where the token is not: not in the frontend bundle, not in
// pipeline.json, not in any response a browser receives, not in a request it
// can inspect. A module calls a same-origin path and never holds the
// credential at all.
//
// legal-docs-client's own documentation suggests VITE_CITATIONS_API_KEY for
// browser projects, which compiles the token into the JavaScript every visitor
// downloads. That is reasonable for a personal key on a local demo and wrong
// for a platform handed to other people, which is why the platform does it
// this way instead.

// setProxies replaces the forwarding table. Run mode builds it once from the
// pipeline; compose mode rebuilds it whenever the composer previews a draft.
func (s *server) setProxies(targets []pipeline.ProxyTarget) error {
	proxies := map[string]http.Handler{}

	for _, target := range targets {
		if target.ID == "" {
			continue
		}
		token := target.Token
		// A deployment that would rather not ship the credential at all can
		// supply it here, and this wins over anything in the export.
		if target.EnvVar != "" {
			if fromEnv := os.Getenv(target.EnvVar); fromEnv != "" {
				token = fromEnv
			}
		}
		if target.BaseURL == "" {
			return fmt.Errorf("module proxy %q has no address to forward to", target.ID)
		}
		base, err := url.Parse(target.BaseURL)
		if err != nil {
			return fmt.Errorf("proxy %q: %q is not a valid address: %w",
				target.ID, target.BaseURL, err)
		}
		proxies[target.ID] = newProxy(base, token)

		if token == "" {
			log.Printf("WARNING: no access token for %q — requests to it will be refused. "+
				"Set %s, or export the platform again with a token filled in.",
				target.ID, envHint(target.EnvVar))
		}
	}

	s.mu.Lock()
	s.proxies = proxies
	s.mu.Unlock()
	return nil
}

func envHint(envVar string) string {
	if envVar == "" {
		return "one"
	}
	return envVar
}

// handleProxy dispatches to whichever upstream the path names.
func (s *server) handleProxy(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/proxy/")
	id, _, _ := strings.Cut(rest, "/")

	s.mu.RLock()
	handler := s.proxies[id]
	s.mu.RUnlock()

	if handler == nil {
		writeError(w, http.StatusNotFound,
			"this platform does not talk to a service called %q", id)
		return
	}
	http.StripPrefix("/api/proxy/"+id, handler).ServeHTTP(w, r)
}

// newProxy forwards to base, adding the bearer credential.
func newProxy(base *url.URL, token string) http.Handler {
	return &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(base)
			// The upstream is a different host, so the inbound Origin, Referer
			// and cookies mean nothing to it and would leak the local address.
			r.Out.Header.Del("Origin")
			r.Out.Header.Del("Referer")
			r.Out.Header.Del("Cookie")
			if token != "" {
				r.Out.Header.Set("Authorization", "Bearer "+token)
			}
		},
		ErrorHandler: func(w http.ResponseWriter, r *http.Request, err error) {
			// Neither the upstream address nor the credential may appear in a
			// message the browser sees.
			log.Printf("proxy error for %s: %v", r.URL.Path, err)
			writeError(w, http.StatusBadGateway,
				"could not reach the document service — check this machine's internet connection")
		},
	}
}

// describeTargets summarises the forwarding table for the startup log, saying
// whether each has a token but never what it is.
func describeTargets(targets []pipeline.ProxyTarget) string {
	parts := make([]string, 0, len(targets))
	for _, t := range targets {
		state := "no token"
		if t.Token != "" {
			state = "token set"
		}
		parts = append(parts, fmt.Sprintf("%s -> %s (%s)", t.ID, t.BaseURL, state))
	}
	return strings.Join(parts, ", ")
}
