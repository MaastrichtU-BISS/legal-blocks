---
title: "Legal Blocks — Architecture"
subtitle: "How it works, why it is shaped this way, and how to work on it"
date: "Last updated: 25 August 2026"
---

# How to read this

Sections 1–8 are **how it works**. Sections 9–12 are **how to work on it** — the
commands, recipes for the things you will actually do, and what to do when a
dependency changes. Picking this up for the first time: read §1–4, then jump
to §9.

This document holds *reasoning*. The code says what it does, and the comments in
this repo are thorough — they are the first stop for "how does this work". What
code cannot say is what was considered and rejected, and why a boundary sits
where it does. That is what lives here.

Update it when a decision changes, not when code changes. If you are editing it
because a function was renamed, the sentence was too specific and should be
deleted rather than corrected.

---

# 1. What this is

Legal Blocks lets someone who does not write code assemble existing packages
into a working platform, and export that platform as a zip a colleague can run.

The problem is specific. There were already several good pieces lying around: an
annotation kit, an agreement-metrics UI, a case-law query builder, a
citation-graph visualiser, a document importer. Each was built for one project
and welded into it. Reusing one meant forking an application.

So this is not another application. It is the **linking factor** — a contract
that lets packages built without knowledge of each other be wired together, plus
two programs that use it.

```
  packages that already existed          this repository
  -----------------------------          ---------------------------
  legal-annotation-kit        \
  vue-iaa-metrics              \         a contract   (manifests)
  vue-legal-query-builder       >---->   a composer   (design one)
  vue-legal-docs-visualizer    /         a platform   (run one)
  vue-legal-docs-import       /          an exporter  (ship one)
  vue-legal-workspace        /
```

Two consequences worth stating early:

- **Neither program knows about any specific module.** Every module-specific
  fact lives in that module's manifest and in one host binding. A module name
  hardcoded in composer or runtime code is a bug.
- **An export is not a build.** Nothing is compiled when you export. The zip is
  about 2 KB: a compose file, the pipeline, a README, and a credentials file if
  the design carries a secret.

---

# 2. Two programs

```
  apps/composer   ->  legal-blocks-composer   design a platform, export a zip
  apps/platform   ->  legal-blocks-platform   run one exported platform
```

Separate Nuxt applications sharing one layer, built into two images. Neither can
do the other's job: `server/api/export.post.ts` exists in the composer and
nowhere else; the database and the module services exist in the platform and
nowhere else.

That separation is **structural, not enforced**. Nothing stops an import
crossing the line — it is a convention held up by review and by the two apps
having separate dependency lists. If it ever needs to be a guarantee, it has to
become a bundle-analysis check in CI.

## What each serves

|                     | composer                            | platform                  |
| ------------------- | ----------------------------------- | ------------------------- |
| `/api/registry`     | yes                                 | yes                       |
| `/api/pipeline`     | no — the draft lives in the browser | the mounted pipeline      |
| `/api/export`       | yes                                 | no                        |
| Database            | **no**                              | only for a workspace      |
| Module services     | **no**                              | those its modules declare |

Both register an `/api/` catch-all that answers JSON. Without it an unknown API
path falls through to the single-page handler and returns **200 with
index.html** — an endpoint that does not exist answering successfully, in HTML,
to a caller expecting JSON. That has cost real debugging time more than once; it
is worth the six lines.

## The version guarantee

The composer writes **its own version** into every export:

```yaml
image: ghcr.io/maastrichtu-biss/legal-blocks-platform:0.1.0
```

`script/docker-build.sh` builds all three images from one commit under one
version, so "the platform image with my version number" is the one that agrees
with this composer about the module registry and the frontend contract. That is
the whole drift guarantee. **Never publish the images separately** — a composer
whose platform tag does not exist produces exports that cannot start.

An unreleased composer is `:dev`, deliberately, rather than `:latest`. So a zip
exported from `npm run dev:composer` runs only on a machine that has built the
`:dev` images itself: it fails loudly on anyone else's rather than quietly
running whatever `:latest` happened to be that week. Export from a published
image for anything you intend to hand over.

---

# 3. The linking contract

A module is described by a manifest at `registry/<id>.module.json`. This is the
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

Five fields carry the weight.

**`entry`** — which component to mount. Resolved through an explicit import map
in `layers/base/app/modules/loaders.ts`. The imports are written out rather than
computed, so the bundler can see them and split each module into its own chunk:
a platform with no search step never downloads the query builder.

**`host`** — names a **host contract**: the shape of props the component needs.
This is the seam. The component asks for a `source` object; the host decides
whether that source reads a database or an in-memory value. See §5.

**`inputs` / `outputs`** — named ports carrying versioned types:

| Type               | Carries                                              |
| ------------------ | ---------------------------------------------------- |
| `corpus@1`         | text to work on — documents with names and full text |
| `document-set@1`   | case law: dates, instances, domains, citations       |
| `annotated-task@1` | a task, by reference                                 |

`corpus@1` and `document-set@1` are deliberately two types. A document set is
case law with structure a visualiser renders and an annotation step has no use
for; collapsing them into `{name, full_text}` threw all of it away before the
visualiser ever saw it.

**`worksIn`** — which kinds of export the module belongs in. Empty means both,
which is what every module in the registry says today. The field earns its keep
anyway: a module that only makes sense with storage, or only without it, has
somewhere to say so, and the composer will not offer it in the wrong kind.

**`services`** — backend operations this module calls. See §7.

## Adapters

`registry/adapters.json` declares legal type conversions. **It is empty, and
that is the honest state rather than a gap.**

There used to be `document-set@1 -> corpus@1`, letting search feed annotation
directly. It worked by taking each result's `summary` — a paragraph the API
writes *about* a case — and presenting it as the document's text. A pipeline
built on it looked right and annotated the wrong thing.

> **The rule that episode left behind.** An adapter may **restate** what a value
> is, and may **drop** what the receiving side has no use for. If it has to go
> and **get** something, it is a module, not an adapter.

---

# 4. Kind: the axis everything follows from

There are two sorts of thing you can build:

```
  PIPELINE                          WORKSPACE
  runs start to finish              somewhere people come back to
  keeps nothing                     everything is stored
  work leaves via a download        work survives; several people share it

  Search -> Explore                 Documents | Labels | Tasks
  Search -> Annotate -> Download      ...open a task:
                                        Annotate -> Agreement
```

**Kind is a property of the export, never of a module.** Not arbitrary — the
packages say so themselves. `legal-annotation-kit` ships both `createBulkSource`
("for hosts with no backend to save to") and `createLazySource` ("for hosts with
an external backend"). The package is telling you the same component works
either way and the host decides. A module declares only which kinds it *can* be
part of.

Do not confuse it with the module's own `kind`:

| Field              | Values                     | Says                   |
| ------------------ | -------------------------- | ---------------------- |
| `Pipeline.kind`    | `pipeline`, `workspace`    | what the **export** is |
| `Manifest.kind`    | `source`, `ui`, `service`  | what the **module** is |
| `Manifest.runtime` | `web`, `node`, `container` | how it is **executed** |

**How the kind gets chosen is a UI decision, not a model one.** The composer
used to open on a screen asking which of two things you were building, before
you had seen a single module. It does not any more: storage is one capability,
so it is offered the way every other capability is — a card called **Workspace**
at the top of the palette. Adding it makes a workspace; leaving it makes a
pipeline, which is the simpler thing and the right default for somebody who has
not decided yet.

That card is deliberately **not** a registry module. It has no package, nothing
to mount and no ports — it is the one capability the platform itself provides,
so a manifest in `registry/` for it would describe a dependency that does not
exist. There was such a module once, `results-download`, whose "package" lived
in this repository; it was removed for exactly this reason. **The registry is
for things that are really somebody else's package.**

Once an export declares its kind, four things follow mechanically:

1. **Storage.** A workspace opens SQLite; a pipeline opens nothing.
2. **Which binding runs.** Every host contract has two implementations (§5).
3. **Which config fields appear.** A `ConfigField` has its own `worksIn`.
4. **Which modules are legal.** Enforced in `validatePipeline`, so an export
   cannot promise a screen that will not function.

Point 3 is subtle and important. All five of the annotate step's task settings —
name, labels, level, annotators, guidelines — are marked `worksIn: ["pipeline"]`.
In a workspace they do not appear in the composer, because there they are not
the composer's decisions. They are made by the user, once per task, in a form.

That is the difference between a platform and an appliance, in one field:
**settings moved from build time to run time.**

---

# 5. How a pipeline becomes a screen

There is no "run the pipeline" pass. **The order is the wiring**: a pipeline is
a list, nobody can skip a step, so step C reads what step B produced.

```
   user opens step C  (index 2)
          |
          v
   resolveInput(C, "corpus")
          |   the step in front of C is B — that is the whole lookup
          v
   produce(B, "task") --------> B's binding .output(ctx)
          |                          |   may itself call ctx.input(...)
          v                          v
      adapt(fromType, toType)   resolveInput(B, ...) -> produce(A, ...)
          |
          v
      value handed to C's binding .props(ctx)
```

Two properties fall out, both of which matter: **steps nobody opened cost
nothing**, and a step is **re-resolved on demand** — `ModuleHost` remounts when
the node changes, when the annotator changes (their queue differs, so their
source differs), or when the parent bumps a revision counter.

This used to be a graph, resolved by walking an edge list backwards. The edges
only ever described the chain the composer had already laid out, and three
failure modes it had to defend against — cycles, unknown ports, one input
connected twice — are simply unrepresentable in a list.

## Moving on by itself

A pipeline advances when a step produces something. A source calls
`ctx.produced()` the moment it has data — the upload finished, the search came
back — and the runtime opens the step that reads it. The data appears where it
is used rather than leaving somebody on a finished form wondering which tab to
press.

Only the step on screen may advance the pipeline, so a background refresh
landing on a step nobody is looking at moves no one. Steps with no natural
finish — annotating is never "done" — never call it, and are moved on from with
the **Next** button in the step bar.

`layers/base/app/runtime/ModuleHost.vue` mounts one step and is deliberately
ignorant:

```
  ModuleHost(node, manifest, env)
      |-- loadComponent(manifest.entry)             -> the Vue component
      |-- bindingFor(manifest.host, env.kind)
      |       .props(contextFor(env, node.id))      -> its props
      +-- <component :is="..." v-bind="props" />
```

It never names a module.

## Host contracts

`layers/base/app/runtime/bindings/` maps a contract name to **two**
implementations, one per kind. This is the single place where "the same
component, fed differently" is expressed.

| Contract              | Module                    | workspace                    | pipeline                        |
| --------------------- | ------------------------- | ---------------------------- | ------------------------------- |
| `AnnotationSource`    | legal-annotation-kit      | task by id from the database | task built from node config     |
| `MetricsSource`       | vue-iaa-metrics           | SQL-filtered queries         | in-memory over the session task |
| `DocumentImport`      | vue-legal-docs-import     | saves a dataset              | holds documents for the session |
| `DocumentSearch`      | vue-legal-query-builder   | results held per node        | results held per node           |
| `DocumentPassthrough` | vue-legal-docs-visualizer | renders and passes through   | same                            |

Modules never learn the difference between the two columns.

## The workspace screen

Nobody owns it; three things collaborate, which is the contract working:

```
  vue-legal-workspace     draws the tabs, tables and modals
                          knows nothing about documents
        |  slot: #create-datasets
        v
  PlatformWorkspace.vue   fills that slot with one ModuleHost per source module
                          knows nothing about which modules exist
        |  manifest.entry
        v
  vue-legal-docs-import   the file picker
                          knows nothing about the workspace
```

The tabs are **computed from the pipeline**, not fixed. No module that brings
documents in, no "Add documents" button. Nothing speaking `annotated-task@1`, no
Tasks tab and no Labels tab — a labelset with nothing to apply it to is
furniture.

---

# 6. Storage

A workspace opens SQLite at `data/platform.db` through `packages/db`.

```
  users
    |-- datasets ----< documents
    |-- labelsets
    |-- tasks                (-> one dataset, one labelset)
    +-- assignments ---+--- span_annotations ---< span_relations
                       |--- document_annotations
                       +--- document_relations   (assignment -> assignment)
```

**Why two annotation tables.** A task has an annotation level. At word,
sentence, paragraph or character level an annotation is a labelled *span* with
offsets. At document level there are no offsets — the label applies to the whole
thing. They genuinely differ, so they are different tables.

The cost is that anything reading "this task's annotations" must read both. That
was a live bug once: the metrics list queried only `span_annotations`, so a
document-level task showed an empty list while agreement metrics worked fine.
`annotations()` now unions the two, presenting document labels as zero-extent
rows — the encoding `iaaInput` already used.

Two decisions in that fix are reusable:

- Read **both** tables unconditionally rather than switching on the task's
  level. `syncTask` can change that level under work that already exists, and
  annotations somebody made should not vanish from a list when it does.
- When two subsystems need the same denormalised shape, pick the encoding one of
  them **already** uses rather than inventing a third.

## What travels from one step to the next

A **reference**, not a blob:

```
  { kind: "dataset",   datasetId }      rows in the database
  { kind: "documents", documents }      held for the session
  { kind: "results",   nodes, edges }   search output, unflattened
  { kind: "task",      taskId }         a stored task
  { kind: "session",   nodeId, task }   an in-memory task
```

Because it is a reference, two modules looking at the same task look at the same
rows. That is what makes "annotate, then measure agreement" work without either
module knowing about the other.

## Re-importing keeps ids

`addDocuments` uses `ON CONFLICT (dataset_id, name) DO UPDATE SET full_text`.
The row keeps its id **and** its text is refreshed, so re-importing a corrected
document does not destroy annotations already on it. Both halves matter, and a
test covers both — `DO NOTHING` satisfies only the first and looks identical in
a naive test.

---

# 7. Backend services

A module can declare `services`. The platform serves them at
`/api/services/<id>/...`; the composer serves none.

| id                | what it is                | where it runs                 |
| ----------------- | ------------------------- | ----------------------------- |
| `docs-import`     | parses PDF, Word, HTML    | a **library** in the platform |
| `legal-docs`      | searches case law         | Nitro routes in the platform  |
| `lawnotation-iaa` | inter-annotator agreement | a **container** beside it     |

**Library versus service is a real distinction and easy to get wrong.**
`lawnotation-iaa` is a separate image for exactly one reason: it is Go, and Node
cannot import Go. Nothing forces that on a parser written in TypeScript, and a
library costs no image to tag, no version pinned in the export's compose file,
no network hop, no health state and no partial-failure mode. If PDF parsing ever
blocks the event loop badly enough to matter, `worker_threads` fixes it inside
the library — still no image.

## Named operations, never a path

This is the security-relevant one.

`legal-docs` holds the platform's Case Law Explorer token. It exposes `search`
and `laws` — two named operations. An earlier design forwarded
`/api/proxy/legal-docs/<anything>` upstream, which kept the token off the page
and still let any script on that page call any endpoint of the API as the
platform's owner.

> A credential the page cannot read but can still spend is only half a fix.

Nitro makes the wrong version easy to write by accident as `[...path].ts`. If
you ever find one there, that fix has been undone.

`lawnotation-iaa` forwards an operation, but checks it against a set of exactly
two. It holds no credential, so a loose path would leak nothing — but there is
no reason to make an exception nobody would remember.

## Credentials

```
  composer form
       |  export
       v
  splitSecrets(pipeline)
       |---> pipeline.json      the design — safe to read, copy, commit
       +---> credentials.json   the one file in the zip that is not
                                     |
                                     v
                      platform reads it at request time
                                     |
                                     v
                        the upstream API, and nowhere else
```

An environment variable wins over the file, so a deployment can supply its own
key without editing a file it received. An **empty token is treated as no
configuration** rather than passed along: the API's own 401 reads as an expired
key and sends whoever is searching after a token they were never given.

---

# 8. Export and release

```
  my-platform.zip                    ~2 KB
  |-- docker-compose.yml     names the images, by version
  |-- pipeline.json          the design (no secrets)
  |-- credentials.json       only when the design carries one
  +-- README.txt             for someone who has never used a terminal
```

`docker compose up`, then <http://localhost:7777>.

## Four lines that are load-bearing

Each has a test in `packages/export/test`, because each is easy to undo by
accident and none fails loudly when wrong.

**`ports: "127.0.0.1:7777:7777"`** — the platform has no login. Anything that
can reach the port can read and write everyone's work. Inside the container it
listens on every interface because that is the only way a published port can
reach it, so this line is the entire access boundary.

**`data:/app/data`** — a named volume, not a bind mount, and `/app/data` exists
in the image owned by `app` so that Docker gives a fresh volume that ownership.
This was a bind mount, on the reasoning that "copy the data folder to back up
your work" should be true. It cost more than it bought: on Linux the daemon
creates a missing `./data` as `root:root`, the platform runs as uid 10001, and
every storage route fails with `SQLITE_CANTOPEN`. Docker Desktop virtualises
bind-mount ownership, so it worked on every Mac it was tested on and on no
Linux host. Backing up is now `docker compose cp platform:/app/data ./backup`,
one documented line instead of an architectural promise.

**`credentials.json` mounted only when one exists** — Compose creates a
*directory* where a bind mount source is missing, so an unconditional line would
leave every credential-free platform with a puzzling empty folder.

**The agreement service appears only when the pipeline uses it**, and is never
published on the host — the platform reaches it over the compose network.

## Settings a compose file sets are read at request time

`runtimeConfig` defaults are evaluated when the image is **built**. Writing
`process.env.X ?? "..."` there reads the *build* environment and bakes the
result in, so the compose file's `environment:` block changes nothing.

That shipped once: agreement metrics answered "the agreement service is not
running" while the container sat there running, which reads as a networking
problem and is not one. `LEGAL_BLOCKS_DIR` and `LEGAL_BLOCKS_IAA_URL` are read
from `process.env` at request time, and the platform's server holds no
`runtimeConfig` reads at all. **Keep it that way.**

---

# 9. Working on it — the daily loop

Everything from here on assumes you are changing legal-blocks. **Using** the
composer needs none of it — no clone, no Node, no npm:

```bash
docker run --rm -p 7788:7788 ghcr.io/maastrichtu-biss/legal-blocks-composer:0.1.0
```

The composer writes nothing and reads nothing but its own bundle, so there is
no volume, no data folder and nothing to configure. That is the command to give
a colleague who wants to design a platform rather than work on one, and its
exports name the public `0.1.0` images so the zip runs on their machine too.

Node 24, pinned in `.nvmrc`. `nvm use` affects only the shell you run it in.

```bash
nvm use
npm install

npm run dev:platform     # http://localhost:7777
npm run dev:composer     # http://localhost:7788

npm test                 # vitest, every package
npm run type-check
```

The platform dev server runs against `apps/platform/dev/pipeline.json` — a
workspace with import, annotation and metrics. Its database is
`apps/platform/dev/data/`, gitignored; **delete that folder to start over**.
Edit the dev pipeline to work against a different composition; the server reads
it once at boot, so restart after changing it.

Agreement metrics need the `lawnotation-iaa` container, which `npm run dev` does
not start. To work on that screen, run the published image alongside:

```bash
docker run -d --rm -p 8080:8080 ghcr.io/maastrichtu-biss/lawnotation-iaa:0.1.0
LEGAL_BLOCKS_IAA_URL=http://localhost:8080 npm run dev:platform
```

## Where things live

```
  packages/manifest/     the contract: Kind, ports, validation, secrets
  packages/db/           schema, queries; resources/ is one file per noun
  packages/export/       the zip an export is — compose, readme, options
  layers/base/app/
    runtime/
      resolve.ts         a step's input is the step before it
      ModuleHost.vue     mounts one module, names none
      bindings/          one file per host contract, + index
    workspace/           the tabbed shell; OpenTask is a task, open
    sources/             adapters onto packages' own source interfaces
    modules/             the import map
    api/                 every call the frontend makes, by subject
  apps/composer/
    components/          palette, flow, ring, card, settings
    composables/         usePlatformDraft — every rule about what may go in
  apps/platform/         run one; server/api is the data API
  registry/              module manifests + index.ts
```

Nothing here is over ~300 lines and most is well under a hundred. That is not
tidiness for its own sake: the rule "a module name never appears in composer or
runtime code" is only checkable if you can read the file that would break it.

## Two rules that have bitten us

**A bundler can follow an import; it cannot follow a file read.** Both the
module registry and the SQL schema were once read from disk relative to
`import.meta.url`, and both broke when bundled — the built server looked for
files nobody had copied. `registry/index.ts` lists manifests explicitly and
`packages/db/src/schema.ts` holds the schema as a string. Anything else the
server needs at runtime must be an import, not a path.

**Check for a stale process before concluding a change did not take.** A server
from an earlier run holding the port, or a Docker image name colliding with an
older build, has cost hours here. These answer it in a second:

```bash
lsof -nP -iTCP:7777 -sTCP:LISTEN
docker inspect <container> --format '{{.Config.Image}}'
```

---

# 10. Recipes

## Adding a web module

1. **Publish the package** (or wire it as `file:../<package>` while iterating —
   `file:` specs symlink, so a rebuild in the package is live immediately, and
   they publish through unchanged).
2. Add it to `layers/base/package.json`.
3. Write `registry/<id>.module.json`.
4. Add one line to `registry/index.ts`.
5. Add one line to the import map in `layers/base/app/modules/loaders.ts`.
6. Add a host contract under `layers/base/app/runtime/bindings/` — **two**
   implementations, one per kind, unless the manifest declares only one.

Steps 4–6 are the only code a new module touches. If you find yourself editing
anything else, something is leaking.

## Updating a module you already use

The common case: `vue-iaa-metrics` gets a fix and you want it in.

```bash
npm install vue-iaa-metrics@latest --workspace @legal-blocks/base
npm test
npm run dev:platform          # exercise the screen it changed
```

Then decide whether it needs a release. **It does if anyone should get it.** The
module's code lives inside the platform image, so a published platform keeps
shipping the old version until you cut a new one:

```bash
./script/docker-build.sh 0.2.0 push
```

Three things to check while you are there:

- **Did its manifest need to change?** New config fields, new ports, a renamed
  component export — all live in `registry/<id>.module.json`, not in the package.
- **Did its host contract change?** If it now wants a prop the binding does not
  supply, `runtime/bindings/` is where that is fixed.
- **Does its stylesheet still resolve?** `legal-annotation-kit` builds a CSS file
  its exports map does not name, and needs an alias in
  `layers/base/nuxt.config.ts`. Drop the alias if a version fixes it; add one if
  another package develops the same problem.

## Updating a package we own

`packages/*` are workspace packages — a change is live in both apps immediately,
no install needed. `node-legal-docs-import` is published, so:

```bash
cd ~/Documents/WORK/node-legal-docs-import
npm version patch && npm publish
cd ~/Documents/WORK/legal-blocks
npm install node-legal-docs-import@latest --workspace @legal-blocks/platform
```

## Adding a data API route

Nitro is file-routed. `server/api/tasks/[id]/queue.get.ts` serves
`GET /api/tasks/1/queue`.

```ts
import { queue } from "@legal-blocks/db";

export default defineEventHandler((event) => {
  const userId = Number(getQuery(event)["user_id"]);
  if (!Number.isInteger(userId)) throw fail(event, 400, "user_id is required");
  return queue(requireDb(event), idParam(event, "id"), userId);
});
```

`requireDb`, `fail`, `idParam` and `usePipeline` are auto-imported from
`server/utils`. Import the database functions **explicitly** — names like `users`
and `tasks` deserve a visible source.

Errors: `throw fail(event, 400, "...")`. `server/error.ts` reshapes everything
into `{"error": "..."}`, which is what `layers/base/app/api/http.ts` reads and shows
the user. Never throw a bare `createError` without a `statusMessage` — the
message is the entire value.

## Adding a backend service

A **library** if it can be one: add the dependency, call it from a route under
`server/api/services/<id>/`, and give it named operation files. A **container**
only if it cannot be a library — then it needs an image, a version pinned in
`packages/export`, and a line in the generated compose file.

Either way, add the id to the module's `services` array in its manifest.

## Cutting a release

```bash
./script/docker-build.sh 0.2.0 push
```

All three images, one version, one commit. The script refuses `:dev` and builds
`lawnotation-iaa` from a sibling checkout — a version whose agreement image
cannot be built is not a release, because exports naming it cannot start.

Then make any **new** package public at
<https://github.com/orgs/MaastrichtU-BISS/packages>. A private package means
your colleague gets `denied` on `docker compose up`, which defeats the point of
handing someone a zip.

## Regenerating this document

```bash
./script/build-docs.sh
```

Markdown is the source; the PDF is a build artefact and is gitignored.

---

# 11. Decisions worth knowing

Each is a decision, the alternative it ruled out, and the reason — which is the
part worth having when revisiting.

**A pipeline may end in a view.** There is no rule that a pipeline producing work
must end in a step where the work can leave. Visualising data is itself a form of
output, and `Search -> Explore` is a complete platform with nothing to download.
*The case this does not cover:* `Search -> Annotate` with no download step, where
annotations really are held in the browser and really are lost on tab close. If
that bites somebody, the check belongs in `validatePipeline` and applies only to
a last step consuming `annotated-task@1`.

**The composer does not preview.** To try a platform, export it and run it.
Preview was a thin overlay mounting the same runtime an export runs, so it proved
little and cost the composer a database, a service registry and a credential path
it otherwise has no reason to hold.

**`docs-import` is a library, not a service.** See §7. The pull toward symmetry
with `lawnotation-iaa` is strong and wrong.

**PDF text is not byte-identical across extractors.** This matters only when
re-importing *the same PDF* into a dataset that already carries annotations,
where offsets would shift. New imports are unaffected.

**Manifests live in this repo, not in the packages.** `registry/*.module.json` is
where they are during the proof of concept, so the npm packages do not all need
republishing at once. The format is exactly what they will carry at their own
package roots — moving them is a file move.

---

# 12. Known gaps

**The composer/platform split is a convention, not a proof.** §2.

**Annotators show as numeric user ids** in the metrics cards and filter
dropdowns, rather than emails. `taskAnnotators` returns ids and `annotations`
formats `user_id`.

**`layers/base/app/types.ts` overlaps `packages/manifest`.** The frontend grew
its own `Pipeline` and `Registry` types when the server could not share code with
it. It can now, and the duplicates should go.

**`legal-annotation-kit` cannot be code-split.** `sources/memory.ts` imports it
statically while `loaders.ts` imports it dynamically, so it stays in the entry
chunk and every platform downloads it, including ones with no annotate step.

**There is no login.** Everything is owned by one account, resolved in
`server/utils/platform.ts`. `Manifest.requiredRole` exists and nothing reads it —
the seam is there so that adding authentication later is enforcing a field that
already exists rather than changing the format.

**An unwritable data directory is still a bare 500.** The named volume removed
the common cause — see §8 — but a read-only mount, SELinux or NFS all still
reach `open()`, which goes straight to `new Database`. The Go build had a
`checkWritable` that printed the exact remedy; it did not survive the rewrite,
so what a user sees is `{"error":"something went wrong on the platform"}` and a
`SQLITE_CANTOPEN` in the log. Worth restoring as a 503 that names the
directory.

> **What that gap cost, while it was open.** It was recorded as "only tested by
> simulating the failure on Desktop, not on a real Linux host" — and it was a
> real bug the whole time, found by a colleague on Linux rather than by us. A
> gap that says "untested on X" is a bug report about X waiting to happen. The
> cheap version of the test existed all along: a named volume chowned to root
> reproduces Linux bind-mount ownership on a Mac in one command.
