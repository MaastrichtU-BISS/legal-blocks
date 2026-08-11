// Package iaa adapts the lawnotation-iaa tool to the platform's Service
// interface.
//
// The whole adapter is this file, which is the point: lawnotation-iaa is an
// ordinary Go package that happens to expose an http.Handler, and making it a
// platform module required no knowledge of the platform on its side.
package iaa

import (
	"net/http"

	upstream "github.com/MaastrichtU-BISS/lawnotation-iaa/iaa"
)

// Service exposes inter-annotator agreement metrics at
// /api/services/lawnotation-iaa/{metrics,report.zip}.
type Service struct{}

// New returns the IAA service.
func New() Service { return Service{} }

// ID implements service.Service.
func (Service) ID() string { return "lawnotation-iaa" }

// Handler implements service.Service.
func (Service) Handler() http.Handler { return upstream.Handler() }
