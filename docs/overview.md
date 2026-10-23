---
title: "Legal Blocks — the short version"
subtitle: "What it is, how to create an application, and how modules fit together"
date: "Last updated: 23 October 2026"
---

# What Legal Blocks is

Legal Blocks is a composer and runtime for building small research applications
from reusable modules. A module can import documents, search case law, annotate
text, explore results, or calculate agreement metrics. The composer checks how
modules fit together, then exports a Docker Compose package that runs the
application.

The platform is the runtime; the application is the design you create for it.
An application can either run as a one-session pipeline or keep its data in the
platform database for people to return to. “Application” is the user-facing term
for both. The code and exported JSON still use `kind: "workspace"` for the
persistent-data mode; this is an implementation name, not a separate product.

## Two application workflows

### Case-law explorer — a pipeline

```text
Search documents  →  Explore documents
```

Create a project in the composer, open it, and add **Search documents** followed
by **Explore documents**. The composer connects compatible ports automatically:
search produces `document-set@1`, which the explorer accepts. Configure the Case
Law Explorer token in the search module, export, and run the generated package.
This is a short-lived workflow: results are available during the session and
are not stored by the platform.

### Shared annotation application — persistent data

```text
Import documents     Annotate     Agreement metrics
       \               |                 /
           shared platform database
```

Create an application that keeps data, then add **Import documents**,
**Annotate**, and **Agreement metrics**. In this mode the modules are available
tools over shared records rather than a linear chain. When the application is
running, upload documents, create a labelset, make a task from the documents and
labelset, assign annotators, and review progress and agreement. Data survives
between visits. Sign-in can be enabled; the current export is intended for
localhost and is not a public HTTPS deployment.

## Create and run an application

1. Start the composer with Docker (no repository or Node setup is needed):

   ```bash
   docker run --rm -p 127.0.0.1:7788:7788 \
     ghcr.io/maastrichtu-biss/legal-blocks-composer:0.8.1
   ```

2. Open <http://localhost:7788>, create a project, and open it in the composer.
3. Add modules from the catalogue. For a pipeline, arrange them in data-flow
   order; for an application with persistent data, enable storage and add the
   tools the people using it need.
4. Configure module settings and credentials. Secret fields are kept out of the
   application definition and placed in `credentials.json` in the export.
5. Export and unzip the package, then run:

   ```bash
   docker compose up
   ```

6. Open <http://localhost:7777>.

The export is a small deployment package, not a build of module source. Its
Compose file pins the composer-compatible platform and service images.

## How modules fit

Each module has a JSON manifest describing its identity, runtime, component,
configuration, services, and typed inputs and outputs. For example:

```json
{
  "id": "vue-legal-docs-visualizer",
  "kind": "ui",
  "runtime": "web",
  "entry": {
    "package": "vue-legal-docs-visualizer",
    "component": "LegalDocVisualizer",
    "style": "vue-legal-docs-visualizer/style.css"
  },
  "host": "DocumentPassthrough",
  "inputs": [{ "name": "documents", "type": "document-set@1", "required": true }],
  "outputs": [{ "name": "documents", "type": "document-set@1" }]
}
```

The composer checks port compatibility, and the runtime supplies the host
binding that connects a module to platform services and data. A package being
available on npm does not by itself make it a selectable module: it must be
integrated into the platform build and described by a manifest.

## Can an npm package or Git repository be used?

Yes, as a **build-time dependency**. npm can install registry packages and Git
dependencies, for example:

```bash
npm install some-package --workspace @legal-blocks/base
npm install 'git+https://github.com/example/some-package.git#<commit>' \
  --workspace @legal-blocks/base
```

Use a release or immutable commit rather than a moving branch for reproducible
builds. A Git URL only downloads the package; it does not adapt its API or
register it with the composer. The platform's web loader uses explicit imports
so Vite can bundle and code-split modules. New packages need a loader entry, a
manifest, and—when they use a new data contract—a host binding. The package is
then included in a platform image release; exported applications do not install
arbitrary npm packages at runtime.

### Turning an existing package into a module

1. Check its license, package exports, framework, and dependencies. A browser UI
   package is easiest when it exports a Vue component and any stylesheet as
   package entry points.
2. Install it as a dependency of `@legal-blocks/base` (or use a local `file:`
   dependency while developing).
3. Add explicit component and stylesheet imports to
   `layers/base/app/modules/loaders.ts`.
4. Add a manifest under `registry/` with a unique id, display metadata, runtime,
   `entry`, configuration, and accurate typed ports.
5. Reuse a host contract from `layers/base/app/runtime/bindings/` when the
   package's data access matches one. Otherwise implement and register a new
   binding that adapts the platform context to the package API.
6. Register the manifest in `registry/index.ts`, test it in the composer and
   platform, and publish a new platform image so exports contain the dependency.

For a non-UI npm package, use it as a server-side library behind named platform
API operations. If it needs a separate process or a different runtime, package
that process as a service and declare it in the service catalogue and module
manifest. Do not expose a general-purpose proxy to a package's upstream API.

## Where to look next

| Need | Start here |
|---|---|
| Install, run, and test the repository | [README](../README.md) |
| Runtime, manifest, bindings, and export details | [architecture.md](architecture.md) |
| Existing compatible module examples | [`registry/`](../registry/) |
| Authoring a new module | Architecture §10, “Adding a web module” |
