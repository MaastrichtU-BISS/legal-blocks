# Legal Blocks

Compose platforms out of existing packages. Pick modules, chain them, export a
zip; the recipient runs `docker compose up` and has a working platform.

```
Search → Explore                              a pipeline: runs once, keeps nothing

            Import documents
                   ↕                          a workspace: everything is stored,
  Annotate  ↔  [ database ]  ↔  Agreement     several people share it
```

New here? **[docs/overview.md](docs/overview.md)** is the fifteen-minute version.

---

## Status

Working end to end: design a platform in the composer, export it, run it with
Docker. A proof of concept — enough to prototype against, not yet a product.
There is no login (see the gaps in the architecture note).

| | | |
|---|---|---|
| `packages/manifest` | module contract, pipeline validation, secrets | 27 tests |
| `packages/db` | schema and queries over better-sqlite3 | 17 tests |
| `packages/export` | the zip: compose file, pipeline, credentials, README | 10 tests |
| `node-legal-docs-import` | text · HTML · Word · PDF, server-only | its own repo, 19 tests |
| `layers/base` | the runtime: resolve, bindings, ModuleHost, workspace | — |
| `apps/composer` | composer UI + `/api/export` | — |
| `apps/platform` | the platform: 28 routes over the database | — |

The Go implementation this replaced is at the tag **`go-final`**, if you ever
need to compare.

### Published

`0.5.0` is on GHCR and public, so an exported platform runs on a machine that
has never seen this repository:

```
ghcr.io/maastrichtu-biss/legal-blocks-composer:0.5.0
ghcr.io/maastrichtu-biss/legal-blocks-platform:0.5.0
ghcr.io/maastrichtu-biss/lawnotation-iaa:0.5.0
```

Cut the next one with `./script/docker-build.sh <version> push`. All three
carry the same version, because the composer writes its own into every export
and the export pulls the other two by that tag.

---

## Running it yourself

### Just using the composer

You do not need this repository, Node, or npm. The composer writes nothing and
reads nothing but its own bundle, so there is no volume to mount and nothing to
configure — one command is the whole setup:

```bash
docker run --rm -p 127.0.0.1:7788:7788 ghcr.io/maastrichtu-biss/legal-blocks-composer:0.5.0
```

Then open <http://localhost:7788>. Its exports name the public `0.5.0` images,
so the zip it gives you runs on any machine with Docker.

That is the command to hand a colleague. Everything below is for working *on*
legal-blocks.

### Working on the source

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

**Add documents** takes text, HTML, Word and PDF; **Labels** → **New labelset**
defines what can be annotated; **Tasks** → **New task** over a dataset and a
labelset opens the annotation screen. Agreement metrics need the sidecar, which
`npm run dev` does not start — see the architecture note's daily loop for
running it alongside.

You can also put documents in without the UI:

```bash
curl -X POST localhost:7777/api/datasets \
  -H 'Content-Type: application/json' \
  -d '{"name":"Rulings","documents":[
        {"name":"doc-a","full_text":"The tenant shall pay rent"},
        {"name":"doc-b","full_text":"The landlord may terminate"}]}'
```

### The composer — where platforms are designed

```bash
npm run dev:composer
```

Then open <http://localhost:7788>.

Add modules from the left — **Workspace** first if the platform should keep
anything — and press **Export platform**. You get a ~2 kB zip:
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

Which means a zip exported from the dev server **runs nowhere but here**. That
is deliberate — see the version guarantee — but if you are exporting something
to hand over rather than to test a change, export from the published composer
image above instead.

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
docs/overview.md      the short version — start here
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
