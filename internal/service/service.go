// Package service defines what a backend module has to satisfy to be part of
// a composed platform.
//
// A Go service is an ordinary package exposing an http.Handler, compiled into
// this binary and mounted at /api/services/<id>/. Adding one — a PDF parser, a
// summariser — means implementing this interface and registering it. No new
// process, no port to allocate, no orchestration, and because it is
// same-origin with the frontend, no CORS handling either.
//
// The manifest's Runtime field leaves room for services that cannot work this
// way (anything not written in Go). Those become separate containers the host
// reverse-proxies to. Handler() is the abstraction that makes the difference
// invisible to the frontend: either way the module calls
// /api/services/<id>/... and does not know which side of that line it is on.
package service

import (
	"fmt"
	"net/http"
	"sort"
)

// Service is one backend module.
type Service interface {
	// ID matches the manifest id and forms the mount path.
	ID() string
	// Handler serves the service's routes, relative to its mount point.
	Handler() http.Handler
}

// Credentialed is a service that calls an API outside the platform and so
// needs its address and access token.
//
// Those arrive after the service is built — from the pipeline at startup, or
// from the composer on every preview — which is why this is a method rather
// than a constructor argument. Implementations are called while serving and
// have to guard the change themselves.
//
// Keeping it separate from Service is what lets a credential stay out of the
// services that have no business holding one: lawnotation-iaa is handed a task
// and returns a report, and there is nothing here for it to implement.
type Credentialed interface {
	Service
	// SetCredentials points the service at its upstream API. An empty token is
	// allowed — the service should say so when asked to work rather than
	// prevent the platform from starting, since every other step still runs.
	SetCredentials(baseURL, token string) error
}

// Registry holds every service compiled into this binary. A pipeline mounts
// the subset its modules declare.
type Registry struct {
	services map[string]Service
}

// NewRegistry builds a registry, rejecting duplicate IDs.
func NewRegistry(services ...Service) (*Registry, error) {
	r := &Registry{services: map[string]Service{}}
	for _, s := range services {
		if _, dup := r.services[s.ID()]; dup {
			return nil, fmt.Errorf("duplicate service id %q", s.ID())
		}
		r.services[s.ID()] = s
	}
	return r, nil
}

// Get returns a service by ID.
func (r *Registry) Get(id string) (Service, bool) {
	s, ok := r.services[id]
	return s, ok
}

// IDs lists registered service IDs in a stable order.
func (r *Registry) IDs() []string {
	ids := make([]string, 0, len(r.services))
	for id := range r.services {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

// Mount attaches the named services to mux under /api/services/<id>/. An
// unknown ID is an error rather than a silent omission: a pipeline whose
// module expects a backend that is not in this build should fail at startup,
// not when a user clicks the button that needs it.
func (r *Registry) Mount(mux *http.ServeMux, ids []string) error {
	for _, id := range ids {
		s, ok := r.services[id]
		if !ok {
			return fmt.Errorf("pipeline needs service %q, which this build does not include", id)
		}
		prefix := "/api/services/" + id
		mux.Handle(prefix+"/", http.StripPrefix(prefix, s.Handler()))
	}
	return nil
}
