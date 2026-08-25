# dev/

What `npm run dev:platform` runs against.

A platform is normally started beside an exported `pipeline.json` and a `data`
folder. In development there is no export, so this stands in: a workspace with
documents, annotation and agreement metrics.

`data/` appears here on first run and is gitignored. Delete it to start over.

Edit `pipeline.json` to develop against a different composition — a `"kind":
"pipeline"` with a search step, say, to work on the case-law explorer shape.
The server reads it once at boot, so restart after changing it.
