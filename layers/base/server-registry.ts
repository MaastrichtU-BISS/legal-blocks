// Building the registry is identical in both apps, and it is done once at
// module scope rather than per request: the manifests are compiled in, so
// nothing about them can change while the server runs, and validation failures
// should surface at boot rather than on somebody's first page load.

import { buildRegistry, type Registry } from "@legal-blocks/manifest";
import { adapters, manifests } from "@registry/index";

export const registry: Registry = buildRegistry(manifests, adapters);
