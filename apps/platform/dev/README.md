# dev/

What `npm run dev:platform` runs against.

A platform is normally started beside an exported `pipeline.json` and a `data`
folder. In development there is no export, so this stands in: a persistent-data
application with document import, annotation and agreement metrics.

`data/` appears here on first run and is gitignored. Delete it to start over.

Edit `pipeline.json` to develop against a different application — for example,
set `"kind": "pipeline"` and use search followed by document exploration to
work on the case-law explorer flow. The persistent-data mode is still serialized
as `"kind": "workspace"` in this file format.
The server reads it once at boot, so restart after changing it.
