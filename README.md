# Legal Blocks

Compose platforms out of existing packages. Pick modules, chain them, export a
zip; the recipient runs `docker compose up` and has a working platform.

```
Import documents →  Annotate  →  Agreement metrics     a workspace, stored
Search           →  Explore                            a pipeline, kept nowhere
Search  →  Annotate  →  Agreement  →  Download         a pipeline, kept nowhere
```

---

## ⚠ Mid-rewrite — nothing runs yet

The Go implementation was deleted in favour of a Nuxt one. **There is currently
no runnable composer and no way to export a platform.** That is expected and
temporary.

Everything the Go version did is reachable in git history — the last commit
holding it is tagged **`go-final`**:

```bash
git show go-final:internal/export/export.go
git log go-final --oneline
```

### What exists

| | | |
|---|---|---|
| `packages/manifest` | module contract, pipeline validation, secrets | ✅ ported, 26 tests |
| `packages/db` | schema and queries over better-sqlite3 | ✅ ported, 10 tests |
| `packages/docs-import` | text · HTML · Word · PDF, server-only | ✅ written, 16 tests |
| `layers/base` | the runtime: resolve, bindings, ModuleHost, workspace | ⏳ moved, not wired |
| `apps/composer` | composer UI | ⏳ moved, not wired |
| `apps/platform` | the exported platform's UI | ⏳ moved, not wired |

### What still has to be built

- **Nuxt scaffolding.** `layers/base` and both apps hold Vue files in the right
  places but no `nuxt.config.ts`, no Nitro routes, no dependencies.
- **The server.** `internal/host` and `internal/composer` become Nitro routes
  over `packages/db`. Not started; the Go original is HTTP plumbing that Nitro
  replaces wholesale rather than something to port line by line.
- **The export.** `internal/export` wrote the zip: `docker-compose.yml`,
  `pipeline.json`, `credentials.json`, `README.txt`. Deliberately *not* ported
  yet, because it changes shape — the Nuxt platform needs a compose file with
  **two** services, since `lawnotation-iaa` stays a Go sidecar. Recover the
  original wording with `git show go-final:internal/export/export.go`; the
  README text in it is worth keeping.
- **Docker.** Two images, plus the published `lawnotation-iaa` image.

---

## Working on it

Node 24 — pinned in `.nvmrc`, because Nuxt 4.5 wants
`^22.19 || ^24.11 || >=26` and the usual default here is 22.17.

```bash
nvm use            # reads .nvmrc
npm install
npm test           # vitest across every package
npm run type-check
```

`nvm use` only affects the shell you run it in, so it is per-terminal rather
than something that stays set. If a command fails with a version complaint,
that is what happened.

## Layout

```
packages/manifest/    the module contract, pipeline model, validation, secrets
packages/db/          schema, queries, resources
packages/docs-import/ server-side document parsing
layers/base/          shared runtime — resolve, bindings, ModuleHost, workspace
apps/composer/        design platforms, export zips
apps/platform/        run one exported platform
registry/*.json       the module catalogue — start here
docs/architecture.md  why things are the way they are
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
