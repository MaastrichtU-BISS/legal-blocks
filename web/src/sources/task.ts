// The annotation task: how one gets built from a corpus, and how it is
// persisted.
//
// A task is the shared state between the annotate step and the metrics step —
// the payload of the annotated-task@1 port type. It is created once from
// whatever the annotate node's corpus input resolves to, then updated in place
// as annotators work.

import type { Assignment, Labelset, TaskData } from "legal-annotation-kit";
import { store } from "../api";
import type { CorpusDocument } from "../types";

/** Colours cycled through when assigning one to each configured label. */
const PALETTE = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
];

export function storeKey(nodeId: string, name: string): string {
  return `${nodeId}.${name}`;
}

function parseLabels(raw: unknown): Labelset {
  const names = String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    name: "Labels",
    desc: "",
    labels: names.map((name, i) => ({ name, color: PALETTE[i % PALETTE.length] })),
  };
}

function emptyAssignment(annotator: number, order: number): Assignment {
  return {
    annotator,
    order,
    status: "pending",
    confidence: 0,
    annotations: [],
    document_annotations: [],
    document_relations: [],
  };
}

/**
 * Builds a fresh task. Every annotator is assigned every document, in the same
 * order — the simplest assignment scheme that still produces the overlap
 * agreement metrics need. Anything more selective is a scheduling feature, and
 * would belong in a module of its own rather than here.
 */
export function buildTask(
  corpus: CorpusDocument[],
  config: Record<string, unknown>,
): TaskData {
  const annotators = Math.max(1, Number(config.annotators ?? 2) || 1);

  return {
    name: String(config.task_name ?? "Annotation task"),
    desc: "",
    labelset: parseLabels(config.labels),
    ann_guidelines: String(config.guidelines_url ?? ""),
    annotation_level: (config.annotation_level as TaskData["annotation_level"]) ?? "word",
    documents: corpus.map((doc, docIndex) => ({
      name: doc.name,
      full_text: doc.full_text,
      assignments: Array.from({ length: annotators }, (_, i) =>
        emptyAssignment(i + 1, docIndex + 1),
      ),
    })),
  };
}

/**
 * Reconciles a stored task with the corpus and config as they are now.
 *
 * The corpus is a folder a user can add files to, and the number of annotators
 * is a setting they can change, so a stored task can be out of date. Documents
 * and assignments are added where they are missing and existing annotations
 * are left alone — losing somebody's work because a new file appeared in a
 * folder would be indefensible. Removing a document from the folder likewise
 * hides it without discarding what was already annotated.
 */
function reconcile(
  task: TaskData,
  corpus: CorpusDocument[],
  config: Record<string, unknown>,
): TaskData {
  const annotators = Math.max(1, Number(config.annotators ?? 2) || 1);
  const byName = new Map(task.documents.map((d) => [d.name, d]));

  const documents = corpus.map((doc, docIndex) => {
    const existing = byName.get(doc.name);
    if (!existing) {
      return {
        name: doc.name,
        full_text: doc.full_text,
        assignments: Array.from({ length: annotators }, (_, i) =>
          emptyAssignment(i + 1, docIndex + 1),
        ),
      };
    }
    const assignments = Array.from({ length: annotators }, (_, i) => {
      const found = existing.assignments.find((a) => a.annotator === i + 1);
      return found ? { ...found, order: docIndex + 1 } : emptyAssignment(i + 1, docIndex + 1);
    });
    return { ...existing, full_text: doc.full_text, assignments };
  });

  // Documents no longer in the corpus keep their annotations but drop out of
  // the queue, so they neither block an annotator nor vanish silently.
  const stillPresent = new Set(corpus.map((d) => d.name));
  const orphans = task.documents.filter((d) => !stillPresent.has(d.name));

  return {
    ...task,
    name: String(config.task_name ?? task.name),
    labelset: parseLabels(config.labels),
    ann_guidelines: String(config.guidelines_url ?? ""),
    annotation_level: (config.annotation_level as TaskData["annotation_level"]) ?? task.annotation_level,
    documents: [...documents, ...orphans],
  };
}

/**
 * Loads the node's task, creating it on first use and reconciling it with the
 * current corpus and config afterwards.
 */
export async function loadTask(
  nodeId: string,
  corpus: CorpusDocument[],
  config: Record<string, unknown>,
): Promise<TaskData> {
  const key = storeKey(nodeId, "task");
  const stored = await store.get<TaskData>(key);
  const task = stored ? reconcile(stored, corpus, config) : buildTask(corpus, config);
  await store.put(key, task);
  return task;
}

export async function saveTask(nodeId: string, task: TaskData): Promise<void> {
  await store.put(storeKey(nodeId, "task"), task);
}
