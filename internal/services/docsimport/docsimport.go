// Package docsimport adapts go-legal-docs-import to the platform's Service
// interface.
//
// Like the IAA adapter, the whole thing is this file: the importer is an
// ordinary Go package exposing an http.Handler, and making it a platform
// module required no knowledge of the platform on its side.
package docsimport

import (
	"net/http"

	upstream "github.com/MaastrichtU-BISS/go-legal-docs-import"
)

// Service parses uploaded files at
// /api/services/docs-import/{formats,import}.
type Service struct{ importer *upstream.Importer }

// New returns the import service, reading every format the library supports.
func New() Service { return Service{importer: upstream.Default()} }

// ID implements service.Service.
func (Service) ID() string { return "docs-import" }

// Handler implements service.Service.
func (s Service) Handler() http.Handler { return s.importer.Handler() }
