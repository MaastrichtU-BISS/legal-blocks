# Legal Blocks

A proof of concept for composing platforms out of our existing packages.

Pick modules, chain them, export a zip. The recipient extracts it, runs
`docker compose up`, and has a working platform — no Node, no npm, no Go,
nothing to build.

```
Import documents →  Annotate  →  Agreement metrics     a workspace, stored
Search           →  Explore                            a pipeline, kept nowhere
Search  →  Annotate  →  Agreement  →  Download         a pipeline, kept nowhere
```

---

## Try it

```bash
docker compose up --build
```

Then open <http://localhost:7788>. Add **Import documents**, **Annotate** and
**Agreement metrics**, and press **Export platform** to get the zip.

From source instead, which is the faster loop while developing:

```bash
cd web && npm install && npm run build && cd ..
go run ./cmd/composer
```

The Go binaries embed `web/dist`, so a frontend change needs that build before
`go run` picks it up. While working on the frontend use `npm run dev:composer`
instead — it proxies `/api` to port 7788.

An export names a platform image *by version*, and a local build is version
`dev`, which no registry has. To actually run what you exported, build the
platform image first:

```bash
./script/docker-build.sh
LEGAL_BLOCKS_PLATFORM_IMAGE=ghcr.io/maastrichtu-biss/legal-blocks-platform \
  docker compose up
```

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
  "modes":   ["ephemeral", "persistent"],
  "outputs": [{ "name": "task", "type": "annotated-task@1" }]
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

### 3. Storage belongs to the platform, not the module

A module never knows where its data lives. That is not a convention invented
here: `legal-annotation-kit` ships `createBulkSource` *"for hosts with no
backend to save to"* alongside `createLazySource` *"for hosts with an external
backend"*. The package itself says the host decides.

So three questions are answered in three separate places:

| Question | Answered by | Example |
|---|---|---|
| *What* data flows here? | the port type | `corpus@1` |
| *Where* does it live? | the pipeline's mode | ephemeral / persistent |
| *How* does the module get it? | the host binding | `createBulkSource` vs SQL |

A **persistent** platform keeps everything in one SQLite database
([`internal/db/schema.sql`](internal/db/schema.sql)); edges carry references, so
two modules looking at the same task look at the same rows. An **ephemeral**
platform stores nothing at all — no database, no data folder — and work lives in
the browser for the session, leaving through a download step.

The same modules build both. `bindings.ts` holds one entry per contract per
mode; a new module reusing an existing contract needs no frontend code at all.

The `host` field in a manifest names the contract, and manifests declare only
which modes they *can* work in — a pure view works in either, a download step
only makes sense when nothing is stored.

The schema follows Lawnotation's vocabulary, since that is the platform most
users of this project are trying to rebuild. Where Lawnotation and the packages
disagree on a name, the packages win: `confidence` not `difficulty_rating`,
`"order"` not `seq_pos`, `"start"`/`"end"` not `start_index`/`end_index`.

---

## What an export contains

About 2 KB:

```
my-platform/
  docker-compose.yml           names the platform image, by version
  pipeline.json                the only file that differs between exports
  credentials.json             access tokens, when the platform needs any
  data/                        created on first run, when the platform stores things
  README.txt                   written for someone who has never used a terminal
```

`docker compose up`, then <http://localhost:7777>.

Nothing is compiled and no program is copied. The image already contains the
frontend and every Go service; the frontend reads `pipeline.json` at startup
and dynamically imports only the modules that pipeline names.

Three lines in the compose file are load-bearing, and each has a test:
the port publishes to `127.0.0.1` only, because the platform has no login;
`./data` is a bind mount rather than a named volume, so "copy the data folder"
is true; and `credentials.json` is mounted only when one exists, because
Compose silently creates a *directory* where a bind source is missing.

**Persistence** is `data/platform.db`, a SQLite database in the folder the
platform was started from. Server-side rather
than in the browser on purpose — it survives a cache clear, users can back it
up by copying one file or send it to you when something looks wrong, and it is
the same seam a hosted Postgres will occupy.

It is also inspectable: `sqlite3 data/platform.db` answers questions about
somebody's annotations without running the platform at all.

---

## Access tokens

A module that calls an outside API declares an `upstream` in its manifest,
naming the Go service that makes those calls, and its token is a `"secret"`
config field. Three things follow.

**The token never reaches a browser.** The host hands it to the service; the
module calls a same-origin `/api/services/<id>/…` path and holds no credential.
`legal-docs-client`'s own docs suggested `VITE_CITATIONS_API_KEY`, which
compiles the token into the JavaScript every visitor downloads — fine for a
personal key on a local demo, wrong for a platform handed to other people.

**The browser cannot spend it either.** The service exposes named operations —
"search this dataset", "search legislation" — and builds each upstream request
itself. An earlier version forwarded `/api/proxy/<id>/<anything>`, which kept
the token off the page but still let a script on that page call any endpoint of
the API as the platform's owner. A credential you cannot read but can still
spend is only half a fix.

**The token never reaches `pipeline.json`.** Exports split it into
`credentials.json` at `0600`, so the pipeline stays safe to read, copy and
commit.

What this does *not* do: anyone holding the exported folder holds the token.
That is unavoidable when a credential has to travel with the platform, so
`README.txt` says it plainly and tells the recipient to delete the file before
passing the folder on. A deployment that would rather ship none can leave the
field blank and set the environment variable instead, which wins over the file.

---

## Adding a Go backend

Your next backend — PDF parsing, summarising — implements one interface:

```go
type Service interface {
    ID() string
    Handler() http.Handler
}
```

Register it in [`cmd/platform/main.go`](cmd/platform/main.go), give it a
manifest with `"kind": "service"`, and it is mounted at
`/api/services/<id>/`. No new process, no port to allocate, no orchestration.

Because it is same-origin with the frontend, the CORS gap `lawnotation-iaa`
documents in its own README simply stops applying — the platform calls it
directly.

`internal/services/iaa/iaa.go` is the whole adapter for the IAA tool. It is
twelve lines.

A backend that calls an API outside the platform also implements
`SetCredentials(baseURL, token)`, and its module declares an `upstream` naming
it. That is the only way an access token gets anywhere near it — which is why
it is a separate interface rather than a field on every service.
`internal/services/legaldocs` is the worked example.

---

## Known limitations

Worth naming before anyone finds them in a demo.

- **No migrations.** A schema change means deleting `data/platform.db` and
  starting over. Fine while the shape is still moving; it needs solving before
  anyone has work they care about.
- **One pipeline holds one of each module.** Nothing is scoped to a pipeline
  step, so two annotate steps would silently share one task rather than failing.
- **The recipient needs Docker.** That is the trade for deleting the binary
  export: no cross-compilation, no code signing, no Gatekeeper walkthrough, but
  also nothing to double-click and no offline first run.
- **Nothing has been run as a container yet.** The images are defined and both
  compose files parse, but no `docker compose up` has actually executed against
  them. First thing to check.
- **No published images.** `./script/docker-build.sh <version> push` expects
  `ghcr.io/maastrichtu-biss` to exist and be writable. Until something is
  pushed, every export names a tag nobody can pull.
- **Exports carry unused modules.** The platform image holds every module's
  JavaScript regardless of the pipeline. Trimming it means per-pipeline images,
  i.e. a build service rather than a zip writer.
- **The chain is linear.** `pipeline.json` is a graph and the validator handles
  arbitrary DAGs, including rejecting cycles; only the composer UI is
  restricted to a chain.
- **Search needs the network.** `vue-legal-query-builder` calls a remote API
  directly, so unlike the Go services it does not work offline.

---

## Login and authorisation

Not implemented, deliberately. Two seams exist for it:

- **The `users` table** already owns everything: labelsets, datasets, tasks and
  assignments all hang off a user, and `external_id` is where a real identity
  (an OIDC subject, a Supabase user id) attaches. `role` is recorded and
  nothing enforces it yet.
- **The "Working as" selector** picks one of those users. Every query already
  takes a user id, so replacing the dropdown with an authenticated identity
  touches that one component and no module.
- **`owner()` in [`internal/host/data.go`](internal/host/data.go)** is the
  single place that assumes "everything belongs to the first user". A login
  replaces it there rather than in every query.

Manifests also carry an optional `requiredRole` that nothing reads yet — so
enforcing authorisation later is a matter of using a field that already exists
in every manifest, rather than changing the format.

---

## Layout

```
cmd/composer/         design platforms, export zips
cmd/platform/         run one exported platform
registry/*.json       the module catalogue — start here
internal/manifest/    manifest types, registry loading, type compatibility
internal/pipeline/    pipeline model and validation
internal/db/          the database: schema, queries, the domain model
internal/service/     the Go backend contract
internal/services/    Go backends: lawnotation-iaa, docs-import, legal-docs
internal/composer/    the composer's server
internal/host/        the platform's server
internal/serve/       what both servers share
internal/build/       version and image reference, stamped at link time
internal/export/      zip assembly: compose file, pipeline, credentials
web/src/runtime/      renders a pipeline — what an exported platform runs
web/src/composer/     the composer UI
web/src/sources/      host implementations of each package's Source contract
web/src/adapters.ts   conversions between port types
web/apps/             one index.html per bundle (composer, platform)
Dockerfile            both images, two targets
script/               docker build, docs
```

## Dependencies

`go.mod` uses a local `replace` for `lawnotation-iaa`, whose library refactor
is not released yet:

```
replace github.com/MaastrichtU-BISS/lawnotation-iaa => ../lawnotation-iaa
```

So this repo currently expects `lawnotation-iaa` to be checked out alongside
it. Swap in a tagged version once that refactor is pushed.
