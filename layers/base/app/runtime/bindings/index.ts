// Host bindings — the runtime's side of each module's data-access contract.
//
// Two things are separated here, and keeping them separate is what lets one set
// of packages build very different platforms:
//
//   the port type says WHAT data flows        (corpus@1, annotated-task@1)
//   the pipeline's kind says WHERE it lives   (ephemeral / persistent)
//   the binding says HOW the module gets it   (a source built either way)
//
// A module declares only the first two of those — its ports and the contract it
// wants — and never learns which kind it is running in. That is not a
// convention this project invented: legal-annotation-kit ships createBulkSource
// "for hosts with no backend to save to" alongside createLazySource "for hosts
// with an external backend". The packages already say the host decides.
//
// So a binding is keyed by contract, and each contract has one implementation
// per mode. A new module reusing an existing contract needs nothing here at all;
// a genuinely new kind of module needs one file, which is the honest cost of a
// new kind of module.

import type { Kind } from "../../types";
import { AnnotationSource } from "./annotation";
import { DocumentImport, DocumentPassthrough, DocumentSearch } from "./documents";
import { MetricsSource } from "./metrics";
import type { Binding, KindBindings } from "./types";

export type {
  Binding,
  BindingContext,
  CorpusValue,
  KindBindings,
  ResultNode,
  TaskValue,
} from "./types";

/** Every contract the registry's manifests can name. */
const contracts: Record<string, KindBindings> = {
  AnnotationSource,
  MetricsSource,
  DocumentImport,
  DocumentSearch,
  DocumentPassthrough,
};

export function bindingFor(host: string | undefined, kind: Kind): Binding {
  if (!host) {
    throw new Error("module manifest has no host contract");
  }
  const byKind = contracts[host];
  if (!byKind) {
    throw new Error(
      `no host binding for contract "${host}" — add one under runtime/bindings/ and list it here`,
    );
  }
  const binding = byKind[kind];
  if (!binding) {
    throw new Error(`the "${host}" contract has no implementation for a ${kind}`);
  }
  return binding;
}
