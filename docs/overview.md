---
title: "Legal Blocks — the short version"
subtitle: "What it is, what it does, and how to try it"
date: "Last updated: 28 August 2026"
---

# The problem

We keep building the same research platform.

Someone needs documents annotated. There is already an annotation kit, a
metrics screen, a case-law search form, a citation graph — each written for one
project and welded into it. Reusing one has meant forking an application and
maintaining the fork.

So the pieces exist. What has been missing is a way to **join** them.

# What Legal Blocks is

Not another platform. A **linking layer**, plus two small programs that use it.

```
  packages we already had              this project
  ---------------------------          -----------------------------------
  legal-annotation-kit      \
  vue-iaa-metrics            \         a contract   how modules describe
  vue-legal-query-builder     >---->                themselves
  vue-legal-docs-visualizer  /         a composer   where you design one
  vue-legal-docs-import     /          a platform   where it runs
                                       an exporter  how it is handed over
```

You pick modules, arrange them, and press export. What comes out is a **2 kB
zip**. Your colleague unzips it, runs one command, and has a working platform.

Nothing is compiled at export time. The zip holds a `docker-compose.yml`, the
design you made, and a README — that is all.

# The two shapes a platform can take

This is the only concept worth holding on to. Everything else follows from it.

## A pipeline — runs once, keeps nothing

```
   Search  ──→  Explore
```

Documents go in one end, results come out the other. Each step reads what the
step before it produced. Nothing is saved: the work lives in the browser for
one session and leaves through a download.

*Good for:* a case-law explorer. Search, look at what came back, take it away.

## A workspace — everything is stored

```
              Import documents
                     ↕
      Annotate  ↔  [ database ]  ↔  Agreement metrics
```

There is no chain here. Every tool reaches the same database, and the people
using the platform decide what work exists — they upload their own documents,
define their own labels, and create their own tasks. Several people share it and
the work survives.

*Good for:* an annotation platform. Upload, define a task, hand it to three
colleagues, measure how much they agreed.

**The same modules build both.** The annotation kit does not know whether it is
saving to a database or to browser memory — the platform decides and hands it
the right one. That is the single trick this project turns on.

# How a module joins in

Each module ships a small JSON file saying what it is:

```json
{
  "id": "legal-annotation-kit",
  "name": "Annotate",
  "icon": "annotate",
  "inputs":  [{ "name": "corpus", "type": "corpus@1", "required": true }],
  "outputs": [{ "name": "task",   "type": "annotated-task@1" }]
}
```

Two things matter here.

**Neither the composer nor the platform knows any module by name.** The palette,
the type checking, the settings forms and the icons are all read from these
files. Adding a module is adding a file — no code in either program changes.

**Ports are typed.** `corpus@1` is text to work on; `document-set@1` is case law
with dates, courts and citations. The composer only lets you place a step where
the one before it produces something that step can read, so a platform that
could not run cannot be built.

# Try it in two minutes

You need Docker. You do not need this repository.

```bash
docker run --rm -p 127.0.0.1:7788:7788 \
  ghcr.io/maastrichtu-biss/legal-blocks-composer:0.5.0
```

Open <http://localhost:7788>, add a couple of modules, press **Export platform**.
Then, in the folder you unzip:

```bash
docker compose up
```

Open <http://localhost:7777> and it is running.

# What is real and what is not

Honest, because prototyping against a false picture wastes more time than it
saves.

**Real.** Both shapes work end to end. Documents import from text, HTML, Word
and PDF. Annotation, agreement metrics and the citation graph all run against
either shape. Exports run on a machine that has never seen this repository.

**Not real yet.**

- **No login.** Who you are is a dropdown. Anything that can reach the port can
  read and write everyone's work, which is why an export publishes only to
  `127.0.0.1`. This is the one gap to know about before showing it to anyone
  outside the room.
- **One task shape.** Every annotator gets every document. Splitting a corpus
  between people is not built.
- **Five modules.** The contract is the point, not the catalogue.

# Where to look next

| | |
|---|---|
| Try it | the two commands above |
| Work on it | [README](../README.md) — install, dev servers, tests |
| Why it is built this way | [architecture.md](architecture.md) — reasoning, decisions, gaps |
| What a module must declare | [`registry/`](../registry) — one JSON file each |

# The one-sentence version

Modules describe themselves, ports say what may be joined to what, and the
platform — not the module — decides where data lives; which is what lets one set
of packages become either a throwaway pipeline or a shared workspace, exported
as a zip that runs anywhere Docker does.
