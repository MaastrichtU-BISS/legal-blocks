// The module catalogue, as something a bundler can see.
//
// The manifests are written out one by one rather than globbed, for the same
// reason the frontend's import map is: a bundler can follow an explicit import
// and cannot follow a directory read. The Go version could read the folder at
// runtime because it embedded it; a Nitro server bundled into .output has no
// folder to read unless somebody remembers to copy one next to it, and
// forgetting that produces a platform that starts and then knows about no
// modules at all.
//
// Adding a module means adding a line here and nothing else on this side.

import adapters from "./adapters.json";
import legalAnnotationKit from "./legal-annotation-kit.module.json";
import vueIaaMetrics from "./vue-iaa-metrics.module.json";
import vueLegalDocsImport from "./vue-legal-docs-import.module.json";
import vueLegalDocsVisualizer from "./vue-legal-docs-visualizer.module.json";
import vueLegalQueryBuilder from "./vue-legal-query-builder.module.json";

export const manifests: unknown[] = [
  legalAnnotationKit,
  vueIaaMetrics,
  vueLegalDocsImport,
  vueLegalDocsVisualizer,
  vueLegalQueryBuilder,
];

export { adapters };
