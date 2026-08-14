// Package export assembles a platform as a zip.
//
// The zip is small on purpose: a compose file, the pipeline, a credentials
// file when the design carries a secret, and a README. Nothing is compiled and
// no program is copied. What the recipient runs is a published image, named by
// version in the compose file.
//
// That is the whole difference from the previous design, which copied a 20 MB
// binary per operating system into every export. Those copies had to be
// cross-compiled ahead of time, went stale against the source they were built
// from — there was a guard whose entire job was catching that — and could
// never be updated once someone held the folder. An image reference has none
// of those properties: it is four lines, it cannot be stale because it is not
// a copy, and upgrading is editing one line.
//
// The cost is real and worth stating: the recipient needs Docker, and needs a
// network on first run to pull. The old export needed nothing at all.
package export

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"strings"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/manifest"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/pipeline"
)

// Options describes one export.
type Options struct {
	Pipeline *pipeline.Pipeline
	Registry *manifest.Registry
	// Image is the platform image, with its tag — normally build.PlatformRef().
	Image string
	// Port the platform is published on. 0 means the default.
	Port int
}

// DefaultPort is where an exported platform is published on the host.
const DefaultPort = 7777

// Write streams the platform zip to w.
func Write(w io.Writer, opts Options) error {
	zw := zip.NewWriter(w)

	// Credentials never go into pipeline.json. That file describes what the
	// platform is, is served to every browser that opens it, and should be
	// safe to read, copy and commit; a token in it would reach all of those
	// places. They go into their own file instead, which is the one thing in
	// an export that has to be handled carefully — and saying that is much
	// easier when it is a single named file.
	clean, secrets := opts.Pipeline.SplitSecrets(opts.Registry)

	pipelineJSON, err := json.MarshalIndent(clean, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding pipeline: %w", err)
	}
	if err := addFile(zw, "pipeline.json", pipelineJSON, 0o644); err != nil {
		return err
	}

	hasCredentials := len(secrets) > 0
	if hasCredentials {
		credentialsJSON, err := json.MarshalIndent(secrets, "", "  ")
		if err != nil {
			return fmt.Errorf("encoding credentials: %w", err)
		}
		// 0600 so that on a shared machine the file is at least not readable
		// by other accounts. Anyone holding the zip still holds the token —
		// that is unavoidable when the credential has to travel with the
		// platform, and README.txt says so plainly.
		if err := addFile(zw, "credentials.json", credentialsJSON, 0o600); err != nil {
			return err
		}
	}

	if err := addFile(zw, "docker-compose.yml", []byte(compose(opts, hasCredentials)), 0o644); err != nil {
		return err
	}

	if err := addFile(zw, "README.txt", []byte(readme(opts, hasCredentials)), 0o644); err != nil {
		return err
	}

	return zw.Close()
}

func addFile(zw *zip.Writer, name string, content []byte, mode fs.FileMode) error {
	hdr := &zip.FileHeader{Name: name, Method: zip.Deflate}
	hdr.SetMode(mode)
	out, err := zw.CreateHeader(hdr)
	if err != nil {
		return fmt.Errorf("adding %s: %w", name, err)
	}
	if _, err := out.Write(content); err != nil {
		return fmt.Errorf("writing %s: %w", name, err)
	}
	return nil
}

// Filename turns a pipeline name into a safe zip filename.
func Filename(name string) string {
	return slug(name) + ".zip"
}

// slug reduces a pipeline name to something usable as a filename and as a
// compose project name, which may only hold lowercase letters, digits, dashes
// and underscores.
func slug(name string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ', r == '-', r == '_':
			b.WriteRune('-')
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = "platform"
	}
	return out
}

// compose writes the file the recipient runs.
//
// Three choices in here are deliberate and easy to get wrong later:
//
// The published port is bound to 127.0.0.1, not to every interface. The
// platform has no login: anything that can reach the port can read and write
// everyone's work. Inside the container it listens on 0.0.0.0 because that is
// the only way the mapping can reach it, so this line is the entire access
// boundary.
//
// Data is a bind mount to ./data rather than a named volume. "Where is my
// work" has to be answerable by looking in a folder — a named volume puts it
// somewhere a legal researcher will never find, and makes "copy the data
// folder to back it up" untrue.
//
// credentials.json is mounted only when there is one. Compose creates a
// *directory* where a bind mount source is missing, so an unconditional line
// would leave every credential-free platform with a puzzling empty folder and
// a host that fails to parse it.
func compose(opts Options, hasCredentials bool) string {
	port := opts.Port
	if port == 0 {
		port = DefaultPort
	}

	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n", opts.Pipeline.Name)
	b.WriteString("#\n")
	b.WriteString("# Start:  docker compose up\n")
	b.WriteString("# Stop:   docker compose down     (your work is kept in ./data)\n")
	b.WriteString("#\n")
	b.WriteString("# The image tag is the version of Legal Blocks this platform was built\n")
	b.WriteString("# with. Changing it upgrades the platform; your data is not touched.\n")
	b.WriteString("\n")
	fmt.Fprintf(&b, "name: %s\n\n", slug(opts.Pipeline.Name))
	b.WriteString("services:\n")
	b.WriteString("  platform:\n")
	fmt.Fprintf(&b, "    image: %s\n", opts.Image)
	b.WriteString("    restart: unless-stopped\n")
	b.WriteString("    ports:\n")
	fmt.Fprintf(&b, "      - \"127.0.0.1:%d:%d\"\n", port, DefaultPort)
	b.WriteString("    volumes:\n")
	b.WriteString("      - ./pipeline.json:/app/pipeline.json:ro\n")
	if hasCredentials {
		b.WriteString("      - ./credentials.json:/app/credentials.json:ro\n")
	}
	b.WriteString("      - ./data:/app/data\n")
	return b.String()
}

// storageSection tells the recipient where their work lives, which differs
// completely between the two kinds of export and is the thing they most need
// to know before they start typing into one.
func storageSection(kind manifest.Kind) string {
	if kind == manifest.KindPipeline {
		return `YOUR WORK

  This platform does not save anything outside your browser. Work stays in the
  browser you did it in: it survives reloading the page and restarting the
  platform, but it is lost if you clear your browsing data, and it is not
  visible in another browser or to anyone else.

  Use the download step to save your results before you finish.
`
	}
	return `YOUR WORK

  Everything you do is saved in the "data" folder next to this file, as you go,
  so closing the browser or refreshing the page does not lose anything.

  To back up your work, copy the "data" folder. To send it to someone, zip it.
  To start over, stop the platform and delete it — it is recreated empty.

  "docker compose down" stops the platform and leaves the folder alone.
`
}

// credentialsSection warns the recipient about the one file in the export that
// is not safe to pass on. Only included when there is such a file.
func credentialsSection() string {
	return `THE FILE CALLED "credentials.json"

  This platform searches a document service on your behalf, and that service
  needs an access key. The key is in "credentials.json".

  Treat that file the way you would treat a password:

    - Anyone who has this folder can use the key.
    - Do not put the folder on a shared drive or send it on to other people.
    - If you need to pass the platform to someone else, delete
      "credentials.json" first and ask whoever gave you this for their own copy.

  The key is never shown in your browser. It stays inside the platform and is
  used only in requests to the document service itself.

`
}

func readme(opts Options, hasCredentials bool) string {
	credentials := ""
	if hasCredentials {
		credentials = credentialsSection()
	}

	var steps strings.Builder
	for i, id := range opts.Pipeline.Order() {
		for _, n := range opts.Pipeline.Nodes {
			if n.ID != id {
				continue
			}
			label := n.Label
			if label == "" {
				label = opts.Registry.Modules[n.Module].Name
			}
			fmt.Fprintf(&steps, "  %d. %s\n", i+1, label)
		}
	}

	port := opts.Port
	if port == 0 {
		port = DefaultPort
	}

	return fmt.Sprintf(`%s
%s

WHAT THIS IS

  A platform you run on your own machine with Docker.

  Steps in this platform:

%s

WHAT YOU NEED

  Docker Desktop, from https://www.docker.com/products/docker-desktop/
  It is free for personal use and for most academic use. Install it, start it,
  and wait for its whale icon to stop animating.

HOW TO START IT

  1. Open a terminal in this folder.
       macOS   : right-click the folder, Services > New Terminal at Folder
       Windows : right-click in the folder, "Open in Terminal"
       Linux   : right-click in the folder, "Open Terminal Here"

  2. Type this and press Enter:

       docker compose up

  3. Wait. The first time, this downloads the platform — a few hundred
     megabytes, once. Afterwards it starts in a second or two.

  4. Open your browser at:

       http://localhost:%d

  Leave the terminal open while you work. To stop the platform, press Ctrl+C
  in it, or run  docker compose down  from the same folder.

IF SOMETHING GOES WRONG

  "docker: command not found"
      Docker is not installed, or the terminal was open before you installed
      it. Install it, then close and reopen the terminal.

  "Cannot connect to the Docker daemon"
      Docker is installed but not running. Start Docker Desktop and wait for
      the whale icon to settle, then try again.

  "port is already allocated"
      Something else on your machine is using port %d — most likely another
      copy of this platform. Stop it, or change the two numbers on the "ports"
      line in docker-compose.yml to a different port.

  The platform opens but is empty
      Check the terminal for a line mentioning pipeline.json. That file has to
      stay in this folder next to docker-compose.yml.

%s%s`, opts.Pipeline.Name, strings.Repeat("=", len(opts.Pipeline.Name)),
		steps.String(), port, port,
		storageSection(opts.Pipeline.ExportKind()), credentials)
}
