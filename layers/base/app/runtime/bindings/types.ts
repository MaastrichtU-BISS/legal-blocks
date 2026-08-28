// What flows between steps, and what a binding is handed when one mounts.
//
// The port types live here rather than beside any one contract because they are
// the vocabulary every contract speaks.

import type { TaskData } from "legal-annotation-kit";
import type { Kind } from "../../types";

/** One document as the search API returns it: an id and its own attributes. */
export interface ResultNode {
  id: string;
  data: Record<string, unknown>;
}

/**
 * What a corpus@1 or document-set@1 port carries.
 *
 * "results" is the difference between the two types, and it is why they are
 * two types. A corpus is text to work on; a document set is case law, with
 * dates, instances, domains and citations that a viewer renders and a
 * annotation step has no use for. Collapsing them into {name, full_text}
 * threw all of that away before the visualiser ever saw it.
 */
export type CorpusValue =
  /** persistent: rows in the database */
  | { kind: "dataset"; datasetId: number }
  /** ephemeral: the documents themselves, held for the session */
  | { kind: "documents"; documents: { name: string; full_text: string }[] }
  /** search output, unflattened */
  | { kind: "results"; nodes: ResultNode[]; edges: unknown[] };

/** What an annotated-task@1 port carries. */
export type TaskValue =
  /** persistent: rows in the database */
  | { kind: "task"; taskId: number }
  /**
   * ephemeral: the task itself, plus the node whose saved work belongs to it.
   *
   * The task travels rather than being rebuilt downstream. A later step can
   * only read what the step in front of it produced, so whatever it needs has
   * to arrive on the port.
   */
  | { kind: "session"; nodeId: string; task: TaskData };

/** What a binding is given when the runtime mounts or resolves a node. */
export interface BindingContext {
  nodeId: string;
  config: Record<string, unknown>;
  /** Where this platform's data lives. */
  kind: Kind;
  /** The current user. A row id when persistent, a position when not. */
  annotator: number;
  /** The task being worked on, when the workspace has one open. */
  taskId?: number;
  /** What a dataset being created should be called. */
  datasetName?: string;
  /** Where in an annotator's queue to open, when not from the top. */
  startPosition?: number;
  /** Called when a module reports it has nothing left to do. */
  finished?: () => void;
  /** Resolves the value arriving on one of this node's input ports. */
  input(portName: string): Promise<unknown>;
  /** Re-runs the current step, after something changes its inputs. */
  refresh(): void;
  /**
   * Says this step has produced its output.
   *
   * A source calls it the moment it has data — the upload finished, the search
   * came back. In a pipeline the runtime takes that as the cue to open the
   * next step, so the data appears where it is read rather than waiting to be
   * clicked through to. A module that never finishes never calls it.
   */
  produced(): void;
}

/** One contract, implemented once per kind of export. */
export interface Binding {
  props(ctx: BindingContext): Promise<Record<string, unknown>>;
  output(ctx: BindingContext, portName: string): Promise<unknown>;
}

/** A contract's implementations, one per kind of export. */
export type KindBindings = Partial<Record<Kind, Binding>>;
