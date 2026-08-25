# Legal Blocks

Compose platforms out of existing packages. Pick modules, chain them, export a
zip; the recipient runs `docker compose up` and has a working platform.

```
Import documents →  Annotate  →  Agreement metrics     a workspace, stored
Search           →  Explore                            a pipeline, kept nowhere
Search  →  Annotate  →  Agreement  →  Download         a pipeline, kept nowhere
```

---

## Status

The Nuxt rewrite is functional end to end: design a platform in the composer,
export it, run it with Docker. The Go implementation it replaced is at the tag
**`go-final`**.

```bash
git show go-final:internal/host/data.go     # if you ever need to compare
```

### What exists

| | | |
|---|---|---|
| `packages/manifest` | module contract, pipeline validation, secrets | ✅ ported, 26 tests |
| `packages/db` | schema and queries over better-sqlite3 | ✅ ported, 10 tests |
| `node-legal-docs-import` | text · HTML · Word · PDF, server-only | ✅ its own repo, 16 tests |
| `packages/export` | the zip: compose file, pipeline, credentials, README | ✅ 9 tests |
| `layers/base` | the runtime: resolve, bindings, ModuleHost, workspace | ✅ wired |
| `apps/composer` | composer UI + `/api/export` | ✅ builds, exports |
| `apps/platform` | the platform: 25 routes over the database | ✅ builds, runs |

### What is left

- **`lawnotation-iaa` is not published.** An export whose pipeline computes
  agreement names `ghcr.io/maastrichtu-biss/lawnotation-iaa:<version>`, and
  nothing exists at that tag. Agreement metrics will not work until it does.
- **No images are published at all**, so an export only runs on a machine that
  built them itself. `./script/docker-build.sh <version> push` when ready.
- **A pipeline can still produce work with no way out.** `Search → Annotate`
  with no download step exports happily and loses everything on tab close.

---

## Running it yourself

Node 24, pinned in `.nvmrc`. `nvm use` only affects the shell you run it in, so
it is per-terminal rather than something that stays set.

```bash
nvm use
npm install
```

### The platform — what an exported platform is

```bash
npm run dev:platform
```

Then open <http://localhost:7777>.

You get the workspace: **Documents**, **Labels**, **Tasks**. It runs against
`apps/platform/dev/pipeline.json`, which stands in for the `pipeline.json` an
export would ship. Its database appears at `apps/platform/dev/data/` and is
gitignored — delete that folder to start over.

**What works today:** everything backed by the database. Create a labelset
under **Labels**, and once documents exist, a task under **Tasks** and annotate
it.

**What does not:** the **Add documents** button opens its modal and the upload
inside it fails — `/api/services/docs-import` is not written yet. Until it is,
put documents in through the API:

```bash
curl -X POST localhost:7777/api/datasets \
  -H 'Content-Type: application/json' \
  -d '{"name":"Rulings","documents":[
        {"name":"doc-a","full_text":"The tenant shall pay rent"},
        {"name":"doc-b","full_text":"The landlord may terminate"}]}'
```

Reload, and **Documents** shows the dataset. From there **Labels** → **New
labelset**, then **Tasks** → **New task** over the two, and the annotation
screen works.

### The composer — where platforms are designed

```bash
npm run dev:composer
```

Then open <http://localhost:7788>.

Add modules, connect them, and press **Export platform**. You get a ~2 kB zip:
a `docker-compose.yml`, your `pipeline.json`, a `credentials.json` when the
design carries a token, and a README written for someone who has never used a
terminal.

To run what you exported, build the images locally first — an export names them
by version and a local build is `:dev`, which no registry has:

```bash
./script/docker-build.sh
```

Then `docker compose up` inside the unzipped folder, and open
<http://localhost:7777>.

### Tests

```bash
npm test           # vitest across every package
npm run type-check
```

## Layout

```
packages/manifest/    the module contract, pipeline model, validation, secrets
packages/db/          schema, queries, resources
packages/export/      the zip an export is
layers/base/          shared Nuxt layer — resolve, bindings, ModuleHost, workspace
apps/composer/        design platforms, export zips
apps/platform/        run one exported platform
registry/*.json       the module catalogue — start here
docs/architecture.md  why things are the way they are
Dockerfile            both images, two targets
script/docker-build.sh  builds and pushes them, one version
script/build-docs.sh  renders the architecture note to PDF
```

## The three ideas

Unchanged by the rewrite, and the reason the code is shaped the way it is.

**Modules declare themselves.** Every module ships a manifest saying what it
renders, what it consumes and produces, and what it needs configured. The
composer has no knowledge of any specific module — its palette, its type
checking and its settings forms are all driven by those files. They live in
[`registry/`](registry/) for now so the npm packages do not all need
republishing at once.

**Ports are typed.** Two steps connect only when the data one produces is data
the next can read: `corpus@1`, `annotated-task@1`, `document-set@1`. A
connection is legal when types match or an adapter is declared for the pair.

**Storage belongs to the platform, not the module.** A module never knows where
its data lives. `legal-annotation-kit` ships `createBulkSource` *"for hosts with
no backend to save to"* alongside `createLazySource` *"for hosts with an
external backend"* — the package itself says the host decides. That is what lets
one set of modules build both a stored workspace and a session pipeline.

See [docs/architecture.md](docs/architecture.md) for the reasoning, the decision
log, and the known gaps.
