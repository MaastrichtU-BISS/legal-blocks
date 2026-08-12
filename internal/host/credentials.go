package host

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path/filepath"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/pipeline"
)

// credentialsFile is where an exported platform keeps its access tokens.
//
// Separate from pipeline.json on purpose. The pipeline describes what a
// platform is and should be safe to read, copy and share; this file is the one
// thing in an export that is not, and having it be a single named file is what
// makes that sayable in one sentence to whoever receives the zip.
const credentialsFile = "credentials.json"

// loadCredentials reads the platform's tokens, if it has any.
//
// A missing file is normal: a platform whose modules need no outside API has
// none, and a deployment may prefer to supply tokens through the environment
// instead.
func loadCredentials(dir string) (pipeline.Secrets, error) {
	raw, err := os.ReadFile(filepath.Join(dir, credentialsFile))
	if errors.Is(err, fs.ErrNotExist) {
		return pipeline.Secrets{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("reading %s: %w", credentialsFile, err)
	}
	var secrets pipeline.Secrets
	if err := json.Unmarshal(raw, &secrets); err != nil {
		return nil, fmt.Errorf("%s is not valid: %w", credentialsFile, err)
	}
	return secrets, nil
}

// handleCredentials lets the composer hand tokens to its own server so Preview
// can reach an API the platform being designed depends on.
//
// Compose mode only, and held in memory only: the composer's draft lives in
// the browser, so this is how the token reaches the proxy without ever being
// written down on the way. It is never read back — there is no GET — because
// nothing should be able to ask this server for a credential.
func (s *server) handleCredentials(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "use POST")
		return
	}
	var secrets pipeline.Secrets
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&secrets); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body: %v", err)
		return
	}
	s.mu.Lock()
	s.secrets = secrets
	s.mu.Unlock()
	w.WriteHeader(http.StatusNoContent)
}
