---
title: "Legal Blocks — Architecture"
subtitle: "A working note for the developer, not a README"
date: "Last updated: 14 August 2026"
---

# Status: mid-rewrite

The Go implementation was deleted. It is reachable at the tag **`go-final`**,
and nothing runs right now — there is no composer and no export until the Nuxt
side is built.

**Sections 1, 3 and 4 are unchanged by this** — the problem, the module
contract and the `Kind` axis are the design, not the implementation. **Sections
2 and 5–10 describe the Go implementation** and are kept as the record of what
the Nuxt side has to reproduce; they are marked where they no longer describe
anything on disk. Section 11 is history and stays true. Sections 12 and 13
describe today.

| | |
|---|---|
| `packages/manifest` | ported — §3, §4 |
| `packages/db` | ported — §7 |
| `packages/docs-import` | written — §8 |
| `layers/base`, `apps/*` | Vue moved into place, not wired |
| the server (§5, §6) | to build as Nitro routes |
| the export (§10) | to rebuild, with a second service |

---

# How to read this

This document exists to hold the *reasoning*, not the API surface. The code
already says what it does; comments in this repo are unusually thorough and
should stay the first stop for "how does this work". What code cannot say is
what was considered and rejected, and why a boundary sits where it does. That
is what lives here.

Read it as three layers:

1. **The shape** — what the product is, and the few ideas everything follows
   from. Sections 1–4.
2. **The mechanisms** — how those ideas are implemented. Sections 5–10.
3. **The record** — decisions with their alternatives, and the known gaps.
   Sections 11–13.

Update it when a decision changes, not when code changes. If you find yourself
editing this because a function was renamed, the document is too specific and
the sentence should be deleted rather than corrected.

---

# 1. What this is

Legal Blocks lets someone who does not write code assemble existing packages —
Vue components and Go backends — into a working platform, and export that
platform as a zip that runs on their machine or a colleague's.

The problem it addresses is specific. There were already several good pieces
lying around: an annotation kit, an agreement-metrics UI, a case-law query
builder, a citation-graph visualiser, a document importer. Each was built for
one project and welded into it. Reusing one meant forking an application.

So the product is not another application. It is the **linking factor**: a
contract that lets packages built without knowledge of each other be wired
together, plus a host that runs the result.

```
  packages that already existed              this repo
  ---------------------------              --------------------
  legal-annotation-kit          \
  vue-iaa-metrics                \          a contract (manifests)
  vue-legal-query-builder         >---->    a composer   (build one)
  vue-legal-docs-visualizer      /          a runtime    (run one)
  vue-legal-docs-import         /           an exporter  (ship one)
```

Two consequences worth stating early, because a lot follows from them:

- **The composer knows nothing about any module.** Every module-specific fact
  lives in that module's manifest and in one host binding. If you find a module
  name hardcoded in composer or runtime code, that is a bug.
- **An export is not a build.** Nothing is compiled or bundled when you export.
  This is why export is instant and needs no toolchain on the exporting
  machine, and it is also the source of one real cost (§10).

---

# 2. Two programs, two images

> **Was the Go implementation.** The shape survives the rewrite — two apps, two
> images, neither able to do the other's job — but the mechanism does not. Go
> gave the split away for free at the linker; Nuxt needs it expressed as
> structure. See the note at the end of this section.

They were separate programs, built from one source tree into two images:

```
  cmd/composer   ->  legal-blocks-composer   design a platform, export a zip
  cmd/platform   ->  legal-blocks-platform   run one exported platform
```

Neither could do the other's job, and that was checked at the linker rather
than by reading:

```
  go list -deps ./cmd/platform | grep internal/export     -> nothing
  go list -deps ./cmd/composer | grep internal/host       -> nothing
```

**That proof does not survive the move to Nuxt, and it is the one thing lost in
the rewrite worth naming.** Two Nuxt apps extending a shared layer separate by
*where files sit*: `server/api/export.post.ts` lives in one app and not the
other. That is clean, and it is a convention rather than a guarantee — nothing
stops an import crossing the line. If the confidence matters, it has to come
back as a bundle-analysis check in CI.

The frontend splits the same way — two Vite builds from one source tree, into
`web/dist/composer` and `web/dist/platform`, each embedded into its own image.
The composer bundle is about 78 KB because it carries no module code at all;
the platform's carries every module it might mount.

```
  web/apps/composer/index.html -> src/composer.ts -> ComposerApp.vue
  web/apps/platform/index.html -> src/platform.ts -> PlatformApp.vue
                                        \
                                         both call boot(), share src/
```

## What each serves

|                     | composer             | platform                   |
| ------------------- | -------------------- | -------------------------- |
| Frontend bundle     | its own              | its own                    |
| `/api/registry`     | yes                  | yes                        |
| `/api/pipeline`     | no — there is no draft on the server | the mounted pipeline |
| `/api/export`       | yes                  | no                         |
| Database            | **no**               | only for a workspace       |
| Go services mounted | **no**               | those the pipeline names   |

Both register an `/api/` catch-all that answers JSON. Without it an unknown API
path falls through to the single-page handler and returns `200` with
`index.html` — an endpoint that does not exist answering successfully, in HTML.
That is worth keeping: it cost real debugging time twice.

## What replaced "one binary, two modes"

The old design was one binary with a `compose` and a `run` subcommand, and an
export was a *copy of that binary*. The argument for it was drift: the export
and the composer could not differ, because they were the same file.

That guarantee still exists, but it is now a version number. The composer
writes its own version into the compose file it exports; both images are built
from one commit by `script/docker-build.sh`. Explicit, inspectable, and
upgradable by editing one line — none of which was true of a copied binary.
See §11.

---

# 3. The linking contract

A module is described by a manifest: `registry/<id>.module.json`. This is the
entire interface between a package and this system.

```json
{
  "id": "legal-annotation-kit",
  "name": "Annotate",
  "kind": "ui",
  "runtime": "web",
  "entry": { "package": "legal-annotation-kit",
             "component": "AnnotationWorkbench",
             "style": "legal-annotation-kit/style.css" },
  "host": "AnnotationSource",
  "worksIn": ["pipeline", "workspace"],
  "inputs":  [{ "name": "corpus", "type": "corpus@1", "required": true }],
  "outputs": [{ "name": "task",   "type": "annotated-task@1" }],
  "config":  [ ... ]
}
```

Four fields carry most of the weight:

**`entry`** — where the component comes from. Resolved through an explicit
import map in `web/src/modules/loaders.ts`. The imports are written out rather
than computed so Vite can see them and split each module into its own chunk: a
platform with no search step never downloads the query builder. That map is the
*only* place frontend code has to mention a new web module.

**`host`** — names a **host contract**: the shape of props this component needs
somebody to supply. This is the seam. The component asks for a `source` object;
the host decides whether that source reads a database or an in-memory value.
See §6.

**`inputs` / `outputs`** — named ports carrying versioned types. Two ports may
connect when their types are equal, or when an adapter is registered for the
pair. Current types:

| Type                | Carries                                                |
| ------------------- | ------------------------------------------------------ |
| `corpus@1`          | text to work on — documents with names and full text   |
| `document-set@1`    | case law: dates, instances, domains, citations         |
| `annotated-task@1`  | a task, by reference                                   |

`corpus@1` and `document-set@1` are deliberately two types rather than one. A
document set is case law with structure a visualiser renders and an annotation
step has no use for. Collapsing them into `{name, full_text}` threw all of that
away before the visualiser ever saw it.

**`worksIn`** — which kinds of export this module belongs in. Empty means both.
`results-download` is `["pipeline"]` only: "take your results and go" is
meaningless where results are already stored.

## Adapters

`registry/adapters.json` declares legal type conversions. **It is currently
empty, and that is the honest state rather than a gap.**

There used to be `document-set@1 -> corpus@1`, letting search feed annotation
directly. It worked by taking each result's `summary` — a paragraph the API
writes *about* a case — and presenting it as the document's text. A pipeline
built on it looked right and annotated the wrong thing.

The rule that episode left behind, and the one to apply to any future adapter:

> An adapter may **restate** what a value is, and may **drop** what the
> receiving side has no use for. If it has to go and **get** something, it is a
> module, not an adapter.

Getting from a search result to an annotatable document means fetching the
judgment — a call per case, then parsing. That is a step a user should see and
choose.

---

# 4. Kind: the axis everything follows from

This is the single most load-bearing idea in the system. There are two sorts of
thing you can build:

```
  PIPELINE                            WORKSPACE
  runs start to finish                somewhere people come back to
  keeps nothing                       everything is stored
  work leaves through a download      work survives; several people share it

  Search -> Explore                   Documents | Labels | Tasks
  Search -> Annotate -> Agreement       ...open a task:
         -> Download                      Annotate -> Agreement
```

**Kind is a property of the export, never of a module.** That is not an
arbitrary choice — the packages themselves say so. `legal-annotation-kit` ships
both `createBulkSource` ("for hosts with no backend to save to") and
`createLazySource` ("for hosts with an external backend"). The package is
telling you the same component works either way and the host decides. A module
declares only which kinds it *can* be part of.

Do not confuse `Kind` with `ModuleKind`. They are different axes:

| Axis         | Values                          | Says                          |
| ------------ | ------------------------------- | ----------------------------- |
| `Kind`       | `pipeline`, `workspace`         | what the **export** is        |
| `ModuleKind` | `source`, `ui`, `service`       | what the **module** is        |
| `Runtime`    | `web`, `go-inproc`, `container` | how the module is **executed**|

`container` is declared and not implemented. It exists so that adding a Python
service later is a manifest change plus a reverse proxy, not a redesign.

## What kind decides

Once an export declares its kind, four things follow mechanically:

1. **Storage.** A workspace opens a SQLite database; a pipeline opens nothing.
2. **Which binding runs.** Every host contract has two implementations (§6).
3. **Which config fields appear.** A `ConfigField` has its own `worksIn`.
4. **Which modules are legal.** `Manifest.SupportsKind`, enforced in
   `pipeline.Validate` — so an export cannot promise a screen that will not
   function.

Point 3 is subtle and worth dwelling on. All five of the annotate step's task
settings — name, labels, level, annotators, guidelines — are marked
`worksIn: ["pipeline"]`. In a workspace they simply do not appear in the
composer, because there they are not the composer's decisions to make. They are
made by the user, once per task, in a form.

That is the whole migration from "one exported platform = one task" in
miniature: **settings moved from build time to run time.**

---

# 5. How a pipeline becomes a screen

> The Vue described here — `resolve.ts`, `bindings.ts`, `ModuleHost.vue` — moved
> to `layers/base/` intact and is what the Nuxt apps are built from. Only the
> server behind `api.ts` has to be rebuilt.

There is no "run the pipeline" pass. Nothing executes top to bottom. Instead a
step asks for its inputs when it is opened, and that request walks *backwards*
through the edges to whatever produces them.

```
   user opens step C
          |
          v
   resolveInput(C, "corpus")
          |
          |  find the edge landing on C.corpus
          v
   produce(B, "task")  ------> B's binding .output(ctx)
          |                          |
          |                          |  may itself call ctx.input(...)
          v                          v
      adapt(fromType, toType)   resolveInput(B, "corpus") -> produce(A, ...)
          |
          v
      value handed to C's binding .props(ctx)
```

Two properties fall out of this, both of which matter:

- **Steps nobody opened cost nothing.** No fetch, no work.
- **A step is re-resolved on demand.** `ModuleHost` remounts when the node
  changes, when the annotator changes (their queue differs, so their source
  differs), or when the parent bumps a `revision` counter after upstream data
  changed.

`web/src/runtime/ModuleHost.vue` is where one step is mounted, and it is
deliberately ignorant:

```
  ModuleHost(node, manifest, env)
      |
      +-- loadComponent(manifest.entry)          -> the Vue component
      +-- bindingFor(manifest.host, env.kind)
              .props(contextFor(env, node.id))   -> its props
      |
      +-- <component :is="..." v-bind="props" />
```

It never names a module. Everything module-specific is in the manifest and the
binding.

## ResolveEnv

The context threaded through all of this:

```
  ResolveEnv {
    pipeline, registry     what is being run
    kind                   pipeline | workspace
    annotator              who is working
    taskId?                which task is open      <-- workspace only
    datasetName?           what an upload will be called
    refresh()              tell the shell to re-read
  }
```

`taskId` is the field that lets one pipeline definition serve many tasks. The
steps are fixed; the task they run against is a parameter. A workspace binding
that needs one calls `requireTask(ctx)`, which throws a readable error rather
than silently doing the wrong thing.

---

# 6. Host contracts

`web/src/runtime/bindings.ts` maps a contract name to **two** implementations,
one per kind. This is the single place where "the same component, fed
differently" is expressed.

| Contract              | Module                      | workspace                     | pipeline                       |
| --------------------- | --------------------------- | ----------------------------- | ------------------------------ |
| `AnnotationSource`    | legal-annotation-kit        | task by id from the database  | task built from node config    |
| `MetricsSource`       | vue-iaa-metrics             | SQL-filtered queries          | in-memory over the session task|
| `DocumentImport`      | vue-legal-docs-import       | saves a dataset               | holds documents for the session|
| `DocumentSearch`      | vue-legal-query-builder     | results held per node         | results held per node          |
| `DocumentPassthrough` | vue-legal-docs-visualizer   | renders and passes through    | same                           |
| `ResultsDownload`     | builtin                     | n/a — pipeline only           | serialises the task to JSON    |

Modules never learned the difference between the two columns. That is why
adding storage to the product required no changes inside any package.

`DocumentPassthrough` is worth noting as the cheap case: a pure view that
renders what it is given and passes the reference on unchanged, so it can sit
anywhere in a chain.

---

# 7. Storage

A running workspace opens SQLite at `data/platform.db`. Schema in
`internal/db/schema.sql`:

```
  users
    |
    +--< datasets ---< documents
    |        |               |
    |        |               |
    +--< tasks              |          tasks.dataset_id -> datasets
    |      | labelset_id ---+---> labelsets
    |      |
    |      +--< assignments  (one user's work on one document in one task)
    |               |
    |               +--< span_annotations ---< span_relations
    |               +--< document_annotations
    |               +--< document_relations
```

The thing to understand here is **why there are two annotation tables**.

A task has an annotation level. At word, sentence, paragraph or character
level, an annotation is a labelled *span* — it has offsets. At document level
there are no offsets: the label applies to the whole thing. Those are different
enough to be different tables, and the split is real, not incidental.

The cost is that anything reading "this task's annotations" has to read both.
That was a live bug until recently: the metrics module's browsable list queried
only `span_annotations`, so a document-level task showed an empty list while
agreement metrics — which read the right tables — worked fine. `db.Annotations`
now unions the two, presenting document labels as zero-extent rows, which is
the encoding `IaaInput` already used and the one the metrics card already
expects.

Two decisions embedded in that fix, both reusable:

- Read **both** tables unconditionally rather than switching on the task's
  level, because `SyncTask` can change that level under work that already
  exists, and annotations somebody made should not vanish from a list.
- When two subsystems need the same denormalised shape, pick the encoding one
  of them **already** uses rather than inventing a third.

## What travels along an edge

In a workspace, what crosses an edge is a **reference**, not a blob:

```
  { kind: "dataset",   datasetId }        rows in the database
  { kind: "documents", documents }        held for the session
  { kind: "results",   nodes, edges }     search output, unflattened
  { kind: "task",      taskId }           a stored task
  { kind: "session",   nodeId, task }     an in-memory task
```

Because it is a reference, two modules looking at the same task are looking at
the same rows. That is what makes "annotate, then measure agreement" work
without either module knowing about the other.

---

# 8. Backend services

> **Changed by the rewrite.** `docs-import` is now `packages/docs-import`, an
> ordinary Node module the platform imports — not a service, not a container.
> `legal-docs` becomes Nitro routes over the published `node-legal-docs-client`.
> Only `lawnotation-iaa` stays a Go service, as its own image, because it is
> 1,500 lines of agreement statistics that already exist and work.
>
> The section below describes the Go arrangement, and the reasoning in it — why
> a credential-holding service exposes named operations rather than a path —
> carries over unchanged.

A backend module is an ordinary Go package exposing an `http.Handler`, compiled
into the platform binary and mounted at `/api/services/<id>/`. The composer
mounts none — it runs nothing.

```
  service.Service       ID() string
                        Handler() http.Handler

  service.Credentialed  Service
                        SetCredentials(baseURL, token) error
```

Adding one means implementing the interface and registering it. No new process,
no port to allocate, no orchestration — and because it is same-origin with the
frontend, no CORS handling either.

Currently compiled in:

| id              | does                                                |
| --------------- | --------------------------------------------------- |
| `lawnotation-iaa` | computes agreement metrics and builds a report zip |
| `docs-import`     | parses PDF, Word, HTML and text server-side        |
| `legal-docs`      | searches Case Law Explorer case law                |

`Credentialed` is separate from `Service` on purpose: it keeps a credential out
of services that have no business holding one. `lawnotation-iaa` is handed a
task and returns a report; there is nothing for it to implement.

A pipeline mounts only the services its modules declare.

## Why `docs-import` is a service and not browser code

The page could read plain text itself. It deliberately does not. The server's
parser normalises what it reads — LF line endings, no BOM — and annotation
offsets are character positions, so a `.txt` read in the page would land
differently from the same content inside a `.docx` read on the server. One
parser, one set of offsets.

---

# 9. Credentials and the trust boundary

This is the part most worth getting right, so it is stated in full.

A `ConfigField` of type `secret` is a credential. It is **never** written into
`pipeline.json` and **never** sent to a browser.

```
  composer form
       |
       |  export
       v
  SplitSecrets(pipeline)
       |
       +---> pipeline.json      the platform's design — safe to read and share
       |
       +---> credentials.json   the one file in the zip that is not
                                        |
                                        v
                            host reads it at startup
                                        |
                                        v
                            applyUpstreams -> service.SetCredentials
```

Separating the two files is what makes the rule sayable in one sentence to
whoever receives the zip: *everything here is shareable except
`credentials.json`.* A deployment can skip the file entirely and set an
environment variable instead (`CITATIONS_API_KEY`).

## Why `legal-docs` is a service and not a proxy

It used to be a proxy: `/api/proxy/legal-docs/<anything>` forwarded upstream
with the token attached. That kept the token off the page, which was the point,
but it left the **browser choosing the upstream path**. Any script on the page
could reach any endpoint of that API, authenticated as the platform's owner.

> A credential the page cannot read but can still spend is only half a fix.

So it became a service with two named operations — search and law lookup — that
builds every upstream request itself. There is no path for a caller to name.
The page asks for a search, not for a URL.

Apply the same test to anything new: *can the browser influence where the
credential is spent?*

---

# 10. Export

> **To rebuild.** The compose file an export writes now needs **two** services:
> the platform and the `lawnotation-iaa` sidecar. That is why this was not
> ported as-is. The original, including the README text written for someone who
> has never used a terminal, is at
> `git show go-final:internal/export/export.go`.

An export is about **2 KB**:

```
  platform.zip
  |
  +-- docker-compose.yml     names the platform image, by version
  +-- pipeline.json          the design (no secrets)
  +-- credentials.json       only when the design carries one
  +-- README.txt             what to install, what to type, where the work is
```

The recipient runs `docker compose up`. Nothing is compiled, and no program is
copied — the compose file references a published image.

## Three lines that are load-bearing

Each has a test in `internal/export/export_test.go`, because each is easy to
undo by accident and none of them fails loudly when wrong.

**`ports: "127.0.0.1:7777:7777"`** — the platform has no login. Anything that
can reach the port can read and write everyone's work. Inside the container it
listens on `0.0.0.0` because that is the only way a published port can reach
it, so this line is the entire access boundary.

**`./data:/app/data`** — a bind mount, not a named volume. "Copy the data
folder to back up your work" has to be true, and a named volume puts the work
somewhere a legal researcher will never find.

**`./credentials.json:...` only when there is one** — Compose creates a
*directory* where a bind mount source is missing. An unconditional line would
leave every credential-free platform with a puzzling empty folder and a host
that fails to parse it.

## The cost

The recipient needs Docker, and a network on first run to pull. The old export
needed nothing at all — it was four binaries and a double-clickable script.
That was genuinely more convenient for a single non-technical recipient, and it
is what was traded away.

What was bought: an export went from 58 MB to 2 KB; `script/build-platforms.sh`
and the discipline of remembering to run it are gone; and the freshness guard
is gone with them.

> **On the freshness guard, since it was a scar worth remembering.**
> `internal/export/stale.go` refused to export when the prebuilt binaries
> predated what they embedded. It existed because that happened three times,
> always the same way: add a module, export, and the zip fails on somebody
> else's machine with "references unknown module". A copied artefact can go
> stale against its source. **A version reference cannot**, which is why the
> guard could be deleted rather than ported.

---

# 11. Decision log

Newest first. Each entry is a decision, the alternative that was rejected, and
the reason — which is the part worth having when revisiting.

### The Go implementation deleted mid-rewrite — Aug 2026

Removed `cmd/`, `internal/`, `go.mod` and the Docker setup before the Nuxt
replacement existed, leaving nothing runnable.

*Rejected:* keeping Go until Nuxt worked, which is what was planned and what I
argued for. The reason for reversing it was not technical — two implementations
of the same product in two languages in one tree is a lot to hold in your head,
and the cost of that was being paid every time anyone opened the repo.

The trade is real and worth being honest about: for the length of the port
there is no composer, no export, nothing to demo. What makes it acceptable is
that nothing is *lost* — the tag `go-final` holds all of it, and the two pieces
most worth re-reading are named in §10 and §13.

The frontend was **moved rather than deleted**: `web/src` became `layers/base`
and the two apps. It is Vue either way, and re-creating 2,500 lines from history
would have been work with nothing to show for it.

### Docker-only export — Aug 2026

An export is a compose file naming a published image, not a folder of
binaries. The binary export was deleted rather than kept alongside.

*Rejected:* keeping both. It means maintaining two export paths and still
cross-compiling for four targets, to serve recipients who — per the people
actually using this — all have Docker.

**The guarantee had to move, and that is the whole design question.** One
binary with two subcommands meant an export could not drift from its composer,
because it *was* its composer. Splitting them needs something else to hold that
line, and the something else is: the composer writes its own version into the
compose file, and `script/docker-build.sh` builds both images from one commit.

Weaker on paper, stronger in practice — a version number is explicit,
inspectable, and can be changed to upgrade a platform someone already has,
which a copied binary never could.

*Costs:* Docker required; a network needed on first run; a registry and a
publish step that did not exist before. *Gone:* `build-platforms.sh`,
`CheckFresh`, the Gatekeeper and SmartScreen sections of the README, and the
quarantine-clearing dance in `Start.command`.

### Composer and platform split in two — Aug 2026

`cmd/composer` and `cmd/platform`, two images, two frontend bundles. Verified
at the linker: neither dependency graph contains the other's packages.

This is what the Docker change was really for. Containerising alone would have
shipped the same coupled artefact behind a nicer front door — every exported
platform still carrying the zip writer, the export endpoint and the composer UI,
unreachable but present.

*Order mattered:* Docker first, split second. Splitting first would have meant
cross-compiling and shipping **two** binaries per export — worse before better.
After containerising, the split cost nothing at export time.

*Also removed:* `/api/validate` (no caller since Preview went; export
re-validates by parsing anyway), and `openBrowser`, which cannot work from
inside a container.

### Preview removed from the composer — Aug 2026

The composer no longer runs a draft. To try something, export it and run it.

Preview was a thin overlay mounting the same `Runtime` component an exported
platform runs, so nothing about the exported product changed. What went with it
was everything that existed only to serve it: `/api/preview`, `/api/credentials`
(already uncalled), the server's write-only `secrets` field and its mutex, the
composer's service mounts, and **the composer's database**.

That last one is the visible change: `compose` no longer leaves a
`platform.db` beside itself.

*Cost:* the loop is slower — export and run to see anything. *Left uncalled:*
`/api/validate` and `validatePipeline`; `handleExport` re-validates server-side
anyway, so a bad pipeline still gets a clear message.

### Citation statistics fetched as a second call — Aug 2026

The Case Law Explorer search endpoints return a graph with no measurements of
it. Degree, community and the centralities come from a separate `/statistics`
endpoint that takes the graph back.

*Rejected:* passing a flag to the search endpoint. There is none — the endpoint
rejects unknown arguments outright, and the legacy GraphQL schema shows
statistics was always a separate lambda. The nearest thing,
`attributesToFetch: NETWORKSTATS`, selects which *fields* return, not what is
computed.

The merge happens **server-side**, in the service, because the token lives
there and nothing downstream can make the call. It is gated on the response's
own `graph.statisticsSafe` flag: a truncated result has citations missing, and
scoring it produces figures that are confidently wrong rather than absent.

*Cost:* a second upstream round trip per search, and `/statistics` is the slow
one. If it bites, the fix is to make it a second request the page issues after
results render.

### The workspace became a generic tabbed shell — Aug 2026

`vue-legal-workspace` draws tabs, tables and modals and knows nothing else.
`PlatformWorkspace.vue` says what the tabs are.

*Rejected:* one component switching on a `:task` / `:labelset` flag. The two
forms' prop signatures genuinely differ, so two named exports are honest and
one flag is not.

The tabs are **computed from the pipeline**, not fixed. No module that brings
documents in, no "Add documents" button. Nothing that speaks
`annotated-task@1`, no Tasks tab and no Labels tab either — a labelset with
nothing to apply it to is furniture.

Two props disappeared rather than being generalised: `canCreateDatasets` (a tab
nobody can add to simply has no `createLabel`) and a
`'tasks'|'datasets'|'labelsets'` union.

### `corpus-source` dropped — Aug 2026

The module that read documents from a folder in the export, along with
`/api/corpus`, `/api/datasets/sync`, `db.SyncDataset` and the `corpus/` folder
in exports.

`SyncDataset` carried real behaviour — documents already present keep their id,
so annotations survive — but `AddDocuments` does the same `ON CONFLICT ... DO
UPDATE`. The test that covered it was retargeted rather than deleted.

*Note:* nothing migrates an existing exported platform. One built before this
still has its `corpus/` folder and keeps working; it just cannot be re-exported
with that module.

### Config fields gained scope — Aug 2026

`ConfigField.WorksIn`, so a setting can be composer-time in a pipeline and
run-time in a workspace. This is what let the same annotate module serve one
fixed task and many user-created ones.

### Kind introduced — Jul 2026

The decision this system turns on. See §4. Everything about many-tasks-per-
export follows from putting this flag on the export rather than on modules.

### `document-set@1 -> corpus@1` adapter removed — Jul 2026

It presented a case summary as the document text. Pipelines built on it
annotated the wrong thing while looking correct. Left behind the adapter rule
in §3.

---

# 12. Known gaps

Things that are true today and that you will trip over.

**Nothing runs.** See the status note at the top. This is the gap that
subsumes most of the others until the port lands.

**Node is pinned to 24 in `.nvmrc`**, because Nuxt 4.5 wants
`^22.19 || ^24.11 || >=26` and this machine defaults to 22.17. `nvm use` is
per-shell, not a setting — a command failing on the version is almost always
a terminal where it was not run.

**`layers/base` and `apps/*` hold Vue in the right folders and nothing else.**
No `nuxt.config.ts`, no Nitro routes, no dependencies, no type-checking. They
are staged, not wired, and `npm test` does not touch them.

**`api.ts` and `types.ts` in `layers/base` overlap `packages/manifest`.** The
frontend grew its own `Pipeline` and `Registry` types when the server was Go and
the two could not share code. They can now, and the duplicates should go when
the apps are wired.

**A pipeline that produces work is not required to end somewhere the work can
leave.** You can compose `Search -> Annotate` with no Download step, export it,
and hand somebody a platform where their annotations vanish when they close the
tab. Validation should catch this. It does not yet — and this is the best moment
to add it, since `packages/manifest` is where it belongs and it is freshly
written.

**Annotators are shown as numeric user ids** in the metrics cards and filter
dropdowns, not emails. Carried over unchanged in the port.

**PDF text will differ from the Go extractor's.** `pdfjs-dist` and
`ledongthuc/pdf` do not produce identical output. It matters only when
re-importing *the same PDF* into a dataset that already carries annotations on
it, where offsets would shift. New imports are unaffected.

**Manifests live in this repo, not in the packages.** `registry/*.module.json`
is where they are during the proof of concept, so the npm packages do not all
need republishing at once. The format is exactly what they will carry at their
own package roots — moving them is a file move.

**No images are published.** Nothing exists at `ghcr.io/maastrichtu-biss`, and
the Docker setup was deleted with the Go tree; it has to be rebuilt for Nuxt.

**The composer/platform split is now a convention, not a proof.** See §2.

---

# 13. Working on this

## The whole loop today

```bash
nvm use               # .nvmrc — Node 24
npm install
npm test              # vitest, every package
npm run type-check
./script/build-docs.sh
```

## Recovering something from the Go implementation

```bash
git show go-final:internal/export/export.go      # the zip and its README text
git show go-final:internal/host/data.go          # the data API's route shapes
git log go-final --oneline
```

Two are worth reading before rebuilding their replacements. `internal/export`
holds README prose written for someone who has never used a terminal, which
took several passes to get right. `internal/host/data.go` is the route surface
`layers/base/api.ts` calls, so it is the specification for the Nitro routes.

## Order of the remaining work

1. **Scaffold Nuxt**: `layers/base/nuxt.config.ts` and one per app.
2. **Nitro routes** over `packages/db`, matching what `layers/base/api.ts`
   already calls. Do the platform first — it is the bigger surface and the one
   with a database behind it.
3. **`legal-docs` as named operations**, not a pass-through path. See §9; this
   is the one place where getting the shape wrong reintroduces a real
   vulnerability.
4. **The export**, with two services in its compose file.
5. **Docker**, then delete nothing — there is nothing left to delete.

## Adding a web module

1. Publish the package.
2. Write `registry/<id>.module.json`.
3. Add one line to the import map in `layers/base/modules/loaders.ts`.
4. Add a host contract to `layers/base/runtime/bindings.ts` — **two**
   implementations, one per kind, unless the module declares only one.

Steps 3 and 4 are the only frontend code a new module touches.

## Repository map

```
  package.json            npm workspaces root
  packages/
    manifest/             the module contract, Kind, pipeline validation, secrets
    db/                   schema, queries, resources
    docs-import/          text, HTML, Word and PDF parsing — server-side only
  layers/base/            shared runtime, moved from web/src, not yet wired
    runtime/              resolve, bindings, ModuleHost
    workspace/            the tabbed shell's host-side content
    sources/              adapters onto packages' own source interfaces
    modules/              the import map and builtin modules
    api.ts                what the frontend calls — the Nitro route spec
  apps/
    composer/             design platforms, export zips
    platform/             run one exported platform
  registry/               module manifests, adapter table
  script/                 docs
  docs/                   this
```
