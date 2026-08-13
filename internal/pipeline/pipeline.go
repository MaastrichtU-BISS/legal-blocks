// Package pipeline defines what a composed platform *is*: a list of module
// instances and the connections between them. A pipeline.json plus the
// prebuilt frontend and this binary is the entire exported product, which is
// why nothing here is specific to any one module.
package pipeline

import (
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strings"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/manifest"
)

// Node is one instance of a module in a pipeline. Two annotate steps in the
// same pipeline are two Nodes sharing a Module.
type Node struct {
	ID     string         `json:"id"`
	Module string         `json:"module"`
	Label  string         `json:"label"`
	Config map[string]any `json:"config,omitempty"`
}

// Endpoint identifies one port on one node.
type Endpoint struct {
	Node string `json:"node"`
	Port string `json:"port"`
}

func (e Endpoint) String() string { return e.Node + "." + e.Port }

// Edge connects an output port to an input port.
type Edge struct {
	From Endpoint `json:"from"`
	To   Endpoint `json:"to"`
}

// Pipeline is the exported platform's definition.
type Pipeline struct {
	Version int    `json:"version"`
	Name    string `json:"name"`
	// Mode says where this platform's data lives. It is a property of the
	// platform rather than of any module: the same annotation component is a
	// step in a durable multi-annotator task or a one-off pass over search
	// results, depending only on which source the host builds for it.
	//
	// Empty means persistent, so a pipeline written before modes existed keeps
	// the behaviour it had.
	Mode  manifest.Mode `json:"mode,omitempty"`
	Nodes []Node        `json:"nodes"`
	Edges []Edge        `json:"edges"`
}

// StorageMode returns the pipeline's mode, defaulting to persistent.
func (p *Pipeline) StorageMode() manifest.Mode {
	if p.Mode == "" {
		return manifest.ModePersistent
	}
	return p.Mode
}

var idPattern = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

// Parse reads and validates a pipeline against a registry.
func Parse(r io.Reader, reg *manifest.Registry) (*Pipeline, error) {
	var p Pipeline
	if err := json.NewDecoder(r).Decode(&p); err != nil {
		return nil, fmt.Errorf("parsing pipeline: %w", err)
	}
	if err := p.Validate(reg); err != nil {
		return nil, err
	}
	return &p, nil
}

// Validate checks that every node names a known module, every edge connects
// ports that exist and carry compatible types, and every required input is
// connected. This is the same check the composer applies when the user draws
// a connection, so an exported pipeline cannot be one the composer would have
// rejected.
func (p *Pipeline) Validate(reg *manifest.Registry) error {
	if len(p.Nodes) == 0 {
		return fmt.Errorf("pipeline has no nodes")
	}

	mode := p.StorageMode()
	if mode != manifest.ModeEphemeral && mode != manifest.ModePersistent {
		return fmt.Errorf("unknown storage mode %q", mode)
	}

	byID := map[string]Node{}
	for _, n := range p.Nodes {
		if !idPattern.MatchString(n.ID) {
			return fmt.Errorf("node id %q must be alphanumeric, dash or underscore", n.ID)
		}
		if _, dup := byID[n.ID]; dup {
			return fmt.Errorf("duplicate node id %q", n.ID)
		}
		m, ok := reg.Modules[n.Module]
		if !ok {
			return fmt.Errorf("node %q references unknown module %q", n.ID, n.Module)
		}
		// A module that cannot work without stored resources has no meaning in
		// a platform that stores nothing, and vice versa. Catching it here
		// means an export cannot promise a screen that will not function.
		if !m.SupportsMode(mode) {
			return fmt.Errorf("module %q does not work in %s mode", n.Module, mode)
		}
		byID[n.ID] = n
	}

	// Every edge must land on ports that exist and carry compatible types.
	connected := map[string]bool{} // "node.port" of satisfied inputs
	for _, e := range p.Edges {
		fromNode, ok := byID[e.From.Node]
		if !ok {
			return fmt.Errorf("edge from unknown node %q", e.From.Node)
		}
		toNode, ok := byID[e.To.Node]
		if !ok {
			return fmt.Errorf("edge to unknown node %q", e.To.Node)
		}
		out, ok := findPort(reg.Modules[fromNode.Module].Outputs, e.From.Port)
		if !ok {
			return fmt.Errorf("module %q has no output port %q", fromNode.Module, e.From.Port)
		}
		in, ok := findPort(reg.Modules[toNode.Module].Inputs, e.To.Port)
		if !ok {
			return fmt.Errorf("module %q has no input port %q", toNode.Module, e.To.Port)
		}
		if !reg.CanConnect(out.Type, in.Type) {
			return fmt.Errorf("cannot connect %s (%s) to %s (%s): %s",
				e.From, out.Type, e.To, in.Type, whyNot(out.Type, in.Type))
		}
		if connected[e.To.String()] {
			return fmt.Errorf("input %s is connected more than once", e.To)
		}
		connected[e.To.String()] = true
	}

	// Required inputs are only required in a session platform.
	//
	// That is where an edge is how data reaches a step: a search feeds a
	// viewer, an upload feeds an annotator, and a step with nothing connected
	// has nothing to work on. With storage none of that is true. Documents
	// become datasets, a task names the dataset and labelset it uses, and the
	// annotate step is opened against a task somebody chose — so the corpus
	// arrives from the workspace, not from whatever happens to be upstream.
	//
	// Insisting on an edge there would mean drawing one that lies: connecting
	// upload to annotate would say "these documents" when the real answer is
	// "whichever dataset the task names". Edges that are present are still
	// type-checked above; they just stop being compulsory.
	if p.StorageMode() == manifest.ModeEphemeral {
		for _, n := range p.Nodes {
			for _, in := range reg.Modules[n.Module].Inputs {
				if in.Required && !connected[n.ID+"."+in.Name] {
					return fmt.Errorf("node %q has no connection for required input %q", n.ID, in.Name)
				}
			}
		}
	}

	return p.checkAcyclic()
}

// checkAcyclic rejects cycles. The composer only builds linear chains today,
// but the model is a graph and an exported pipeline.json can be hand-edited,
// so the runtime must not be able to loop forever resolving inputs.
func (p *Pipeline) checkAcyclic() error {
	deps := map[string][]string{}
	for _, e := range p.Edges {
		deps[e.To.Node] = append(deps[e.To.Node], e.From.Node)
	}
	const (
		visiting = 1
		done     = 2
	)
	state := map[string]int{}
	var walk func(string) error
	walk = func(id string) error {
		switch state[id] {
		case done:
			return nil
		case visiting:
			return fmt.Errorf("pipeline contains a cycle through node %q", id)
		}
		state[id] = visiting
		for _, dep := range deps[id] {
			if err := walk(dep); err != nil {
				return err
			}
		}
		state[id] = done
		return nil
	}
	for _, n := range p.Nodes {
		if err := walk(n.ID); err != nil {
			return err
		}
	}
	return nil
}

// Order returns node IDs in dependency order — every node after the nodes
// feeding it. The runtime uses this to lay out the step navigation.
func (p *Pipeline) Order() []string {
	deps := map[string][]string{}
	for _, e := range p.Edges {
		deps[e.To.Node] = append(deps[e.To.Node], e.From.Node)
	}
	var out []string
	seen := map[string]bool{}
	var walk func(string)
	walk = func(id string) {
		if seen[id] {
			return
		}
		seen[id] = true
		for _, dep := range deps[id] {
			walk(dep)
		}
		out = append(out, id)
	}
	for _, n := range p.Nodes {
		walk(n.ID)
	}
	return out
}

// ServiceIDs lists the Go services the pipeline's modules require, so the host
// mounts only what is actually used.
func (p *Pipeline) ServiceIDs(reg *manifest.Registry) []string {
	seen := map[string]bool{}
	var out []string
	for _, n := range p.Nodes {
		for _, s := range reg.Modules[n.Module].Services {
			if !seen[s] {
				seen[s] = true
				out = append(out, s)
			}
		}
	}
	return out
}

// whyNot explains a refused connection. The generic answer is true but
// unhelpful — someone wiring a search into an annotation step has a reasonable
// idea and is missing a piece, and saying which piece is the difference
// between a dead end and a next step.
func whyNot(from, to string) string {
	if from == "document-set@1" && to == "corpus@1" {
		return "search results are cases, not documents to work on. Getting their text " +
			"means fetching each judgment, which is a preprocessing step rather than " +
			"something that can happen on this connection"
	}
	return "no adapter declared"
}

func findPort(ports []manifest.Port, name string) (manifest.Port, bool) {
	for _, p := range ports {
		if strings.EqualFold(p.Name, name) {
			return p, true
		}
	}
	return manifest.Port{}, false
}
