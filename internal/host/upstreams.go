package host

import (
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/pipeline"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/service"
)

// Some of a platform's modules depend on APIs outside it, which need an access
// token. This is where a token typed into the composer ends up: handed to the
// Go service that makes those calls, and nowhere else.
//
// Where the token is not is the point. Not in the frontend bundle, not in
// pipeline.json, not in any response a browser receives, not in a request it
// can inspect. The module calls a same-origin service and never holds it.
//
// An earlier version of this forwarded /api/proxy/<id>/ to the API with the
// token attached. That much was already true then — but it also let the
// browser pick the upstream path, so a page could spend the platform's
// credential on any endpoint of that API it liked. Handing the token to a
// service with named operations is what closes that.

// applyUpstreams gives each service its API address and credential.
func (s *server) applyUpstreams(upstreams []pipeline.Upstream) error {
	for _, up := range upstreams {
		token := up.Token
		// A deployment that would rather not ship the credential at all can
		// supply it here, and this wins over anything in the export.
		if up.EnvVar != "" {
			if fromEnv := os.Getenv(up.EnvVar); fromEnv != "" {
				token = fromEnv
			}
		}
		if up.BaseURL == "" {
			return fmt.Errorf("service %q has no address to call", up.Service)
		}

		svc, ok := s.cfg.Services.Get(up.Service)
		if !ok {
			return fmt.Errorf("a module needs service %q, which this build does not include", up.Service)
		}
		credentialed, ok := svc.(service.Credentialed)
		if !ok {
			return fmt.Errorf("service %q was given an access token but does not take one", up.Service)
		}
		if err := credentialed.SetCredentials(up.BaseURL, token); err != nil {
			return fmt.Errorf("configuring service %q: %w", up.Service, err)
		}

		if token == "" {
			// Not fatal: every other step of the platform still works, and the
			// service itself explains the problem to whoever tries to search.
			log.Printf("WARNING: no access token for %q — searches will be refused. "+
				"Set %s, or export the platform again with a token filled in.",
				up.Service, envHint(up.EnvVar))
		}
	}
	return nil
}

func envHint(envVar string) string {
	if envVar == "" {
		return "one"
	}
	return envVar
}

// describeUpstreams summarises the outside APIs for the startup log, saying
// whether each has a token but never what it is.
func describeUpstreams(upstreams []pipeline.Upstream) string {
	parts := make([]string, 0, len(upstreams))
	for _, up := range upstreams {
		state := "no token"
		if up.Token != "" || (up.EnvVar != "" && os.Getenv(up.EnvVar) != "") {
			state = "token set"
		}
		parts = append(parts, fmt.Sprintf("%s -> %s (%s)", up.Service, up.BaseURL, state))
	}
	return strings.Join(parts, ", ")
}
