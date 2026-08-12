// Package manifest defines the module contract — the "linking factor" that
// lets independently developed packages be wired together without the
// composer knowing anything about them.
//
// Every module ships a platform.module.json describing what it renders, what
// data it consumes and produces, and what it needs configured. During the
// proof of concept those files live in this repo's registry/ directory so the
// npm packages don't all need republishing at once; the format is exactly the
// one they will carry at their own package roots, so moving them later is a
// file move and nothing else.
package manifest

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"sort"
	"strings"
)

// Kind separates modules that render something from modules that only expose
// an HTTP API. A "source" is a UI module with no inputs — the start of a
// pipeline.
type Kind string

const (
	KindSource  Kind = "source"
	KindUI      Kind = "ui"
	KindService Kind = "service"
)

// Mode says where a platform's data lives.
//
// This is a property of a pipeline, never of a module: legal-annotation-kit
// ships both createBulkSource ("for hosts with no backend to save to") and
// createLazySource ("for hosts with an external backend"), which is the
// packages themselves saying that the same component works either way and the
// host decides. A module declares only which modes it can work in.
type Mode string

const (
	// ModeEphemeral keeps everything in the browser for the session. No
	// database, no server-side state — caselaw-explorer-demo is exactly this:
	// a query builder and a visualiser, three dependencies, no backend.
	ModeEphemeral Mode = "ephemeral"
	// ModePersistent stores everything in the platform's database, so work
	// survives, several people share it, and resources are created at runtime.
	ModePersistent Mode = "persistent"
)

// Modes lists both, in the order the composer offers them.
var Modes = []Mode{ModeEphemeral, ModePersistent}

// Runtime says how a module is executed, and is the seam that keeps packaging
// swappable. "web" modules are Vue components in the frontend bundle;
// "go-inproc" modules are Go packages compiled into this binary; "container"
// modules are separate images the host reverse-proxies to. Only the first two
// are implemented — "container" is declared here so adding a Python service
// later is a manifest change plus a proxy, not a redesign.
type Runtime string

const (
	RuntimeWeb       Runtime = "web"
	RuntimeGoInProc  Runtime = "go-inproc"
	RuntimeContainer Runtime = "container"
)

// Port is one named connection point carrying a versioned data type such as
// "corpus@1". Two ports may be connected when their types are equal, or when
// an Adapter is registered for the pair.
type Port struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Required bool   `json:"required,omitempty"`
}

// ConfigField describes one setting the composer renders as a form control and
// writes into the node's config in pipeline.json.
//
// Modes limits a field to the storage modes it makes sense in. A setting that
// describes one task — its labels, its annotation level — belongs to the
// composer only when there is no runtime place to create tasks. Leave Modes
// empty for a field that applies in every mode, such as a deployment URL.
type ConfigField struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	// "text" | "number" | "select" | "labelset" | "secret"
	//
	// A "secret" is a credential. It is never written into pipeline.json and
	// never sent to a browser: the export puts it in its own file and the host
	// keeps it server-side, so a platform can call an API on its users' behalf
	// without handing them the key.
	Type    string   `json:"type"`
	Default any      `json:"default,omitempty"`
	Options []string `json:"options,omitempty"`
	Help    string   `json:"help,omitempty"`
	Modes   []Mode   `json:"modes,omitempty"`
	// Link points at wherever the value is obtained — an account page for a
	// token, say. The composer renders it next to the field, because a
	// setting nobody knows how to fill in may as well not exist.
	Link     string `json:"link,omitempty"`
	LinkText string `json:"linkText,omitempty"`
}

// IsSecret reports whether a field holds a credential.
func (f ConfigField) IsSecret() bool { return f.Type == "secret" }

// AppliesIn reports whether a config field is offered in the given mode.
func (f ConfigField) AppliesIn(mode Mode) bool { return modeAllowed(f.Modes, mode) }

// modeAllowed treats an empty list as "every mode", so a manifest only has to
// say something when a module or field is genuinely restricted.
func modeAllowed(modes []Mode, mode Mode) bool {
	if len(modes) == 0 {
		return true
	}
	for _, m := range modes {
		if m == mode {
			return true
		}
	}
	return false
}

// Entry tells the runtime frontend which component to mount for a web module.
// Package is the npm package name; Component is a named export from it.
type Entry struct {
	Package   string `json:"package"`
	Component string `json:"component"`
	Style     string `json:"style,omitempty"`
}

// Manifest is one module's complete declaration.
type Manifest struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Version     string  `json:"version"`
	Kind        Kind    `json:"kind"`
	Runtime     Runtime `json:"runtime"`

	Entry *Entry `json:"entry,omitempty"`

	// Modes limits the module to the storage modes it can work in. A pure
	// view works in both; a module that manages stored resources only makes
	// sense with a database. Empty means every mode.
	Modes []Mode `json:"modes,omitempty"`

	Inputs  []Port `json:"inputs,omitempty"`
	Outputs []Port `json:"outputs,omitempty"`

	// Host names the data-access contract the runtime must implement for this
	// module — "AnnotationSource" for legal-annotation-kit, "MetricsSource"
	// for vue-iaa-metrics. The packages were already built this way; the
	// runtime supplies the implementation, backed by the host's store.
	Host string `json:"host,omitempty"`

	// Services lists Go service IDs this module calls at runtime. The host
	// mounts only the services a pipeline actually references.
	Services []string `json:"services,omitempty"`

	// Upstream declares that one of this module's services calls an API
	// outside the platform, and where its credentials come from. The host
	// hands them to that service at startup; the module calls the service and
	// never holds a token. Without this the only way to authenticate from the
	// frontend is to ship the token to it, which is what the package's own
	// documentation suggests and exactly what should be avoided.
	Upstream *Upstream `json:"upstream,omitempty"`

	Config []ConfigField `json:"config,omitempty"`

	// RequiredRole is the authorisation seam. Nothing reads it yet — it is
	// here so that adding login later is a matter of enforcing a field that
	// already exists in every manifest, rather than changing the format.
	RequiredRole string `json:"requiredRole,omitempty"`
}

// SupportsMode reports whether the module can work in the given mode.
func (m Manifest) SupportsMode(mode Mode) bool { return modeAllowed(m.Modes, mode) }

// Upstream describes an outside API a module's service depends on.
type Upstream struct {
	// Service is the id of the Go service that makes the calls. It must also
	// appear in Services, and must implement service.Credentialed.
	Service string `json:"service"`
	// BaseURLKey names the config field holding the API's address.
	BaseURLKey string `json:"baseUrlKey"`
	// TokenKey names the secret config field holding the credential.
	TokenKey string `json:"tokenKey,omitempty"`
	// EnvVar lets a deployment supply the credential at run time instead of
	// shipping it, and takes precedence over anything in the export.
	EnvVar string `json:"envVar,omitempty"`
}

// Adapter is a declared conversion between two port types. The Go side uses
// these only to decide whether a connection is legal; the conversion itself
// is a pure function in the frontend's adapter registry, keyed by the same
// From/To pair.
type Adapter struct {
	From        string `json:"from"`
	To          string `json:"to"`
	Description string `json:"description,omitempty"`
}

// Registry is the set of modules and adapters available to the composer.
type Registry struct {
	Modules  map[string]Manifest `json:"modules"`
	Adapters []Adapter           `json:"adapters"`
}

// Load reads a registry from dir: every *.module.json file as a module, plus
// adapters.json. The caller supplies the filesystem so the registry can be
// embedded in the binary (production) or read from disk (while editing
// manifests).
func Load(dir fs.FS) (*Registry, error) {
	reg := &Registry{Modules: map[string]Manifest{}}

	entries, err := fs.ReadDir(dir, ".")
	if err != nil {
		return nil, fmt.Errorf("reading registry: %w", err)
	}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".module.json") {
			continue
		}
		raw, err := fs.ReadFile(dir, name)
		if err != nil {
			return nil, fmt.Errorf("reading %s: %w", name, err)
		}
		var m Manifest
		if err := json.Unmarshal(raw, &m); err != nil {
			return nil, fmt.Errorf("parsing %s: %w", name, err)
		}
		if m.ID == "" {
			return nil, fmt.Errorf("%s: missing id", name)
		}
		if _, dup := reg.Modules[m.ID]; dup {
			return nil, fmt.Errorf("duplicate module id %q", m.ID)
		}
		if err := m.validateUpstream(); err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		reg.Modules[m.ID] = m
	}

	raw, err := fs.ReadFile(dir, "adapters.json")
	if err != nil {
		return nil, fmt.Errorf("reading adapters.json: %w", err)
	}
	if err := json.Unmarshal(raw, &reg.Adapters); err != nil {
		return nil, fmt.Errorf("parsing adapters.json: %w", err)
	}

	return reg, nil
}

// validateUpstream checks that a declared upstream names a service the module
// actually uses. A credential handed to a service nobody mounts is a token
// sitting in an export for no reason.
func (m Manifest) validateUpstream() error {
	if m.Upstream == nil {
		return nil
	}
	if m.Upstream.Service == "" {
		return fmt.Errorf("upstream does not say which service makes the calls")
	}
	for _, id := range m.Services {
		if id == m.Upstream.Service {
			return nil
		}
	}
	return fmt.Errorf("upstream names service %q, which this module does not list in \"services\"",
		m.Upstream.Service)
}

// CanConnect reports whether a value of type from can feed a port of type to,
// either directly or through a declared adapter.
func (r *Registry) CanConnect(from, to string) bool {
	if from == to {
		return true
	}
	for _, a := range r.Adapters {
		if a.From == from && a.To == to {
			return true
		}
	}
	return false
}

// ModuleIDs returns the registry's module IDs in a stable order.
func (r *Registry) ModuleIDs() []string {
	ids := make([]string, 0, len(r.Modules))
	for id := range r.Modules {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}
