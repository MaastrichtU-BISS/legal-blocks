package export

import (
	"archive/zip"
	"bytes"
	"io"
	"strings"
	"testing"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/manifest"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/pipeline"
	"github.com/MaastrichtU-BISS/legal-blocks/registry"
)

const image = "ghcr.io/example/legal-blocks-platform:1.2.3"

func loadRegistry(t *testing.T) *manifest.Registry {
	t.Helper()
	reg, err := manifest.Load(registry.FS())
	if err != nil {
		t.Fatalf("loading registry: %v", err)
	}
	return reg
}

// parse builds a pipeline the same way the host does, so a test can never
// assert on something Validate would have rejected.
func parse(t *testing.T, reg *manifest.Registry, body string) *pipeline.Pipeline {
	t.Helper()
	p, err := pipeline.Parse(strings.NewReader(body), reg)
	if err != nil {
		t.Fatalf("parsing pipeline: %v", err)
	}
	return p
}

// workspace is a stored platform with an upload step and an annotate step, and
// no credential anywhere in it.
const workspace = `{"version":1,"name":"My workspace","kind":"workspace","nodes":[
  {"id":"import1","module":"vue-legal-docs-import","label":"Import documents"},
  {"id":"annot1","module":"legal-annotation-kit","label":"Annotate"}
],"edges":[]}`

// searching carries an access token, which is what puts a credentials file in
// the export.
const searching = `{"version":1,"name":"Find cases","kind":"pipeline","nodes":[
  {"id":"search1","module":"vue-legal-query-builder","label":"Search",
   "config":{"api_token":"secret-value","api_base_url":"https://example.invalid"}},
  {"id":"viz1","module":"vue-legal-docs-visualizer","label":"Explore"}
],"edges":[{"from":{"node":"search1","port":"documents"},"to":{"node":"viz1","port":"documents"}}]}`

func build(t *testing.T, body string) map[string]string {
	t.Helper()
	reg := loadRegistry(t)

	var buf bytes.Buffer
	if err := Write(&buf, Options{
		Pipeline: parse(t, reg, body),
		Registry: reg,
		Image:    image,
	}); err != nil {
		t.Fatalf("Write: %v", err)
	}

	zr, err := zip.NewReader(bytes.NewReader(buf.Bytes()), int64(buf.Len()))
	if err != nil {
		t.Fatalf("reading the zip: %v", err)
	}
	out := map[string]string{}
	for _, f := range zr.File {
		rc, err := f.Open()
		if err != nil {
			t.Fatalf("opening %s: %v", f.Name, err)
		}
		raw, err := io.ReadAll(rc)
		rc.Close()
		if err != nil {
			t.Fatalf("reading %s: %v", f.Name, err)
		}
		out[f.Name] = string(raw)
	}
	return out
}

// An export is a compose file and the pipeline, and nothing that has to be
// cross-compiled. The point of the whole change is that this list is short.
func TestExportIsAComposeFileAndNotAProgram(t *testing.T) {
	files := build(t, workspace)

	want := []string{"docker-compose.yml", "pipeline.json", "README.txt"}
	if len(files) != len(want) {
		t.Errorf("export holds %d files, want %d: %v", len(files), len(want), keys(files))
	}
	for _, name := range want {
		if _, ok := files[name]; !ok {
			t.Errorf("export is missing %s", name)
		}
	}
	for name := range files {
		if strings.HasPrefix(name, "platform-") || strings.HasPrefix(name, "Start") {
			t.Errorf("export still ships %q", name)
		}
	}
}

// The version written here is the whole drift guarantee now: this image is the
// one that agrees with the composer about the module registry.
func TestComposeNamesTheImageItWasBuiltWith(t *testing.T) {
	files := build(t, workspace)
	if !strings.Contains(files["docker-compose.yml"], "image: "+image) {
		t.Errorf("compose file does not name %s:\n%s", image, files["docker-compose.yml"])
	}
}

// The platform has no login, so anything that can reach the port can read and
// write everyone's work. Publishing on every interface would put a colleague's
// annotations on the office network.
func TestPortIsPublishedOnLocalhostOnly(t *testing.T) {
	compose := build(t, workspace)["docker-compose.yml"]
	if !strings.Contains(compose, `"127.0.0.1:7777:7777"`) {
		t.Errorf("port is not bound to localhost:\n%s", compose)
	}
}

// "Copy the data folder to back up your work" has to be true, so the mount is
// a folder next to the compose file rather than a named volume.
func TestWorkIsStoredInAFolderTheUserCanSee(t *testing.T) {
	files := build(t, workspace)
	if !strings.Contains(files["docker-compose.yml"], "./data:/app/data") {
		t.Errorf("data is not bind-mounted:\n%s", files["docker-compose.yml"])
	}
	if !strings.Contains(files["README.txt"], `"data" folder`) {
		t.Error("README does not tell the reader where their work is")
	}
}

// Secrets never travel in pipeline.json, and the compose file only mounts a
// credentials file when there is one to mount — compose creates a directory
// where a bind source is missing, so an unconditional line would be worse than
// no line at all.
func TestCredentialsAreSeparatedAndMountedOnlyWhenPresent(t *testing.T) {
	with := build(t, searching)
	if !strings.Contains(with["credentials.json"], "secret-value") {
		t.Error("the token did not reach credentials.json")
	}
	if strings.Contains(with["pipeline.json"], "secret-value") {
		t.Error("the token leaked into pipeline.json, which is served to browsers")
	}
	if !strings.Contains(with["docker-compose.yml"], "credentials.json:/app/credentials.json:ro") {
		t.Error("compose file does not mount the credentials it shipped")
	}
	if !strings.Contains(with["README.txt"], "credentials.json") {
		t.Error("README does not warn about the credential file")
	}

	without := build(t, workspace)
	if _, ok := without["credentials.json"]; ok {
		t.Error("a platform with no secrets got a credentials file")
	}
	if strings.Contains(without["docker-compose.yml"], "credentials.json") {
		t.Errorf("compose file mounts a credentials file that is not there:\n%s",
			without["docker-compose.yml"])
	}
}

// A pipeline keeps nothing and a workspace keeps everything; the reader needs
// to know which one they have before they start typing into it.
func TestReadmeSaysWhereWorkGoesForEachKind(t *testing.T) {
	if !strings.Contains(build(t, workspace)["README.txt"], "saved in the \"data\" folder") {
		t.Error("workspace README does not say work is stored")
	}
	if !strings.Contains(build(t, searching)["README.txt"], "does not save anything") {
		t.Error("pipeline README does not say work is not stored")
	}
}

func TestFilenameIsSafe(t *testing.T) {
	for in, want := range map[string]string{
		"My workspace":  "my-workspace.zip",
		"  Trim  me  ":  "trim--me.zip",
		"!!!":           "platform.zip",
		// Anything that is not a letter, a digit or a separator is dropped
		// rather than replaced, so a path separator cannot survive into a
		// filename in any form.
		"Ünïcödé/paths": "ncdpaths.zip",
	} {
		if got := Filename(in); got != want {
			t.Errorf("Filename(%q) = %q, want %q", in, got, want)
		}
	}
}

func keys(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
