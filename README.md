# Legal Blocks

A proof of concept for composing platforms out of our existing packages.

Pick modules, chain them, export a zip. The recipient extracts it, double-clicks
one file, and has a working platform — no Node, no npm, no Docker, nothing to
install.

```
Document folder  →  Annotate  →  Agreement metrics
```

---

## Try it

```bash
go run ./cmd/legal-blocks compose
```

The composer opens in your browser. Add **Document folder**, **Annotate**,
**Agreement metrics**, press **Preview** to use it, or **Export platform** to
get the zip.

To rebuild the frontend after changing anything under `web/src`:

```bash
cd web && npm install && npm run build
```

The Go binary embeds `web/dist`, so a frontend change needs that build before
`go run` picks it up. While working on the frontend, run the composer with
`-no-open` and use `npm run dev` instead — it proxies `/api` to port 7788.

---

## The idea

Three things make this work, and they are the parts worth discussing.

### 1. Modules declare themselves

Every module ships a `platform.module.json` saying what it renders, what data
it consumes and produces, and what it needs configured. The composer has no
knowledge of any specific module — its palette, its type checking and its
settings forms are all driven by these files.

```json
{
  "id": "vue-iaa-metrics",
  "entry": { "package": "vue-iaa-metrics", "component": "MetricsPage" },
  "host": "MetricsSource",
  "services": ["lawnotation-iaa"],
  "inputs":  [{ "name": "task", "type": "annotated-task@1", "required": true }],
  "outputs": [{ "name": "report", "type": "iaa-report@1" }],
  "config":  [{ "key": "criterion", "type": "select", "options": ["exact", "contained"] }]
}
```

They live in [`registry/`](registry/) for now so the npm packages do not all
need republishing at once. The format is exactly the one they will carry at
their own package roots — moving them later is a file move.

### 2. Ports are typed, and adapters bridge the gaps

Two steps connect only when the data one produces is data the next can read.
`corpus@1`, `annotated-task@1`, `document-set@1` — a connection is legal when
the types match, or when an adapter is declared for the pair in
[`registry/adapters.json`](registry/adapters.json).

That is what lets modules written without knowledge of each other be chained.
The query builder emits search results; the annotation kit wants documents with
text. Neither knows the other exists, and neither had to change — the
conversion is [one function](web/src/adapters.ts) plus a declaration.

The composer greys out steps that cannot connect and says why:

> Needs `annotated-task@1`, but the previous step produces `corpus@1`.

The same rule is enforced in Go when a pipeline is exported
([`internal/pipeline`](internal/pipeline/pipeline.go)), so an export cannot be
something the composer would have rejected.

### 3. The host implements the contracts

`legal-annotation-kit` and `vue-iaa-metrics` were already built the right way:
each exposes a component plus a `Source` interface that the *host* implements.
Neither package owns any persistence or networking.

So this project did not need a plugin system. It needed to be a host. The
`host` field in a manifest names the contract, and the runtime implements
contracts rather than modules — a second annotation module declaring
`"host": "AnnotationSource"` would work with no frontend change at all.

---

## What an export contains

```
my-platform/
  platform          the same binary that built it, ~12 MB, everything inside
  Start.command     macOS: double-click
  Start.bat         Windows: double-click
  pipeline.json     the only file that differs between exports
  corpus/*.txt      the input documents
  data/             created on first run — this is the persistence
  README.txt        written for someone who has never used a terminal
```

Nothing is compiled or bundled at export time. The frontend is prebuilt and
identical in every export — it reads `pipeline.json` at startup and dynamically
imports only the modules that pipeline names — and the binary already contains
every Go service. Exporting is: copy two prebuilt artefacts, write one JSON
file, add the documents. It takes about a second.

**Persistence** is the `data/` folder: one JSON file per key, written
atomically. Server-side rather than in the browser on purpose — it survives a
cache clear, users can back it up by copying a folder or send it to you when
something looks wrong, and it is the same seam a hosted database will occupy.

---

## Adding a Go backend

Your next backend — PDF parsing, summarising — implements one interface:

```go
type Service interface {
    ID() string
    Handler() http.Handler
}
```

Register it in [`cmd/legal-blocks/main.go`](cmd/legal-blocks/main.go), give it a
manifest with `"kind": "service"`, and it is mounted at
`/api/services/<id>/`. No new process, no port to allocate, no orchestration.

Because it is same-origin with the frontend, the CORS gap `lawnotation-iaa`
documents in its own README simply stops applying — the platform calls it
directly.

`internal/services/iaa/iaa.go` is the whole adapter for the IAA tool. It is
twelve lines.

---

## Known limitations

Worth naming before anyone finds them in a demo.

- **One user at a time.** A task is stored as a single document and rewritten
  whole on each save, so two people annotating the same task from two browsers
  would overwrite each other. The fix is per-assignment storage keys; it is not
  worth doing before there is a login to attach it to.
- **Exports are for the current platform only.** The export copies the running
  binary, so exporting from a Mac produces a Mac platform. Cross-platform
  exports need a CI matrix building the binary for each OS and the composer
  embedding that set.
- **Unsigned binaries.** macOS Gatekeeper will warn on first launch;
  `README.txt` tells the recipient to right-click → Open. Getting rid of that
  needs an Apple Developer ID and notarisation.
- **Exports carry unused modules.** A few MB of JavaScript for modules the
  pipeline does not use. Trimming it means per-export builds, i.e. a build
  service rather than a zip writer.
- **The chain is linear.** `pipeline.json` is a graph and the validator handles
  arbitrary DAGs, including rejecting cycles; only the composer UI is
  restricted to a chain.
- **Search needs the network.** `vue-legal-query-builder` calls a remote API
  directly, so unlike the Go services it does not work offline.

---

## Login and authorisation

Not implemented, deliberately. Two seams exist for it:

- **`store.Store`** ([`internal/store`](internal/store/store.go)) is a
  four-method interface. Per-user scoping lands in an implementation of it, and
  a hosted database is a drop-in replacement.
- **The annotator selector** in the runtime is a dropdown reading
  `localStorage`. Everything downstream already takes the annotator as an
  input rather than assuming a single user, so replacing the dropdown with a
  real identity does not touch any module.

Manifests also carry an optional `requiredRole` that nothing reads yet — so
enforcing authorisation later is a matter of using a field that already exists
in every manifest, rather than changing the format.

---

## Layout

```
cmd/legal-blocks/     entry point: `compose` and `run` modes
registry/*.json       the module catalogue — start here
internal/manifest/    manifest types, registry loading, type compatibility
internal/pipeline/    pipeline model and validation
internal/store/       persistence
internal/service/     the Go backend contract
internal/services/    Go backends (currently: lawnotation-iaa)
internal/host/        the server both modes run on
internal/export/      zip assembly
web/src/runtime/      renders a pipeline — what an exported platform runs
web/src/composer/     the composer UI
web/src/sources/      host implementations of each package's Source contract
web/src/adapters.ts   conversions between port types
corpus/*.txt          sample input documents
```

## Dependencies

`go.mod` uses a local `replace` for `lawnotation-iaa`, whose library refactor
is not released yet:

```
replace github.com/MaastrichtU-BISS/lawnotation-iaa => ../lawnotation-iaa
```

So this repo currently expects `lawnotation-iaa` to be checked out alongside
it. Swap in a tagged version once that refactor is pushed.
