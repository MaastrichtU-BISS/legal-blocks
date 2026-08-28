// The ephemeral half of the host: everything in the browser, nothing stored.
//
// This is the mode caselaw-explorer-demo lives in — three packages, no
// backend. The annotation kit already ships the source for it:
// `createBulkSource`, documented as "for hosts with no backend to save to",
// which mirrors every save to localStorage so work survives a refresh without
// a database anywhere.
//
// The host only supplies the storage key, which is what makes it possible to
// collect several annotators' work back together for the metrics step.

import { createBulkSource } from "legal-annotation-kit";
import type {
  AnnotationSource,
  Assignment,
  AssignmentBundle,
  Labelset,
  TaskData,
} from "legal-annotation-kit";
import type {
  AnnotationFilters,
  DocumentOption,
  IaaInputData,
  IaaMetricsResponse,
  IaaParams,
  LabelOption,
  MetricsSource,
  RichAnnotation,
} from "vue-iaa-metrics";
import { callService } from "../api";
import type { CorpusDocument } from "../types";

/** Colours cycled through when the settings give only label names. */
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

/** Where one annotator's in-progress work lives. Owned by the host so the
 *  metrics step can read every annotator's, not just its own. */
function bundlesKey(nodeId: string, annotator: number): string {
  return `lb:session:${nodeId}:annotator${annotator}`;
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
 * Builds the task an ephemeral platform annotates.
 *
 * Its shape comes from the composer, and here that is the right place for it:
 * with nothing stored there is no runtime screen on which to create a task, so
 * whoever assembled the platform decides what is being annotated. In a
 * persistent platform those same settings belong to a row a user creates.
 */
export function buildTask(
  corpus: CorpusDocument[],
  config: Record<string, unknown>,
): TaskData {
  const annotators = Math.max(1, Number(config.annotators ?? 1) || 1);
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

/** One annotator's source, backed by the package's own bulk implementation. */
export function createSessionAnnotationSource(
  nodeId: string,
  task: TaskData,
  annotator: number,
): AnnotationSource {
  return createBulkSource(task, annotator, bundlesKey(nodeId, annotator));
}

/**
 * Rebuilds the whole annotated task from what each annotator has saved.
 *
 * Every annotator's bundles sit under their own key, so this is the ephemeral
 * equivalent of the database's "read the task back": it merges their work into
 * one task the metrics step can measure. Annotators who have not started yet
 * simply contribute their empty assignments.
 */
export function collectTask(nodeId: string, task: TaskData): TaskData {
  const annotators = new Set<number>();
  for (const doc of task.documents) {
    for (const a of doc.assignments) annotators.add(a.annotator);
  }

  const collected: TaskData = {
    ...task,
    documents: task.documents.map((d) => ({ ...d, assignments: [...d.assignments] })),
  };

  for (const annotator of annotators) {
    const raw = localStorage.getItem(bundlesKey(nodeId, annotator));
    if (!raw) continue;
    let bundles: AssignmentBundle[];
    try {
      bundles = JSON.parse(raw) as AssignmentBundle[];
    } catch {
      // A corrupt key is not worth failing the whole report over; that
      // annotator just reads as having done nothing.
      continue;
    }
    for (const bundle of bundles) {
      const doc = collected.documents.find((d) => d.name === bundle.document.name);
      if (!doc) continue;
      const index = doc.assignments.findIndex((a) => a.annotator === annotator);
      if (index >= 0) doc.assignments[index] = bundle.assignment;
    }
  }
  return collected;
}


// --- metrics over an in-memory task ----------------------------------------

/**
 * Converts a task into the IAA service's input.
 *
 * The same mapping the database side does, and for the same reason: the two
 * schemas differ only in a field name and whether annotator ids are strings.
 */
function toIaaInput(task: TaskData): IaaInputData {
  const documentLevel = task.annotation_level === "document";
  return {
    labelset: { labels: task.labelset.labels.map((l) => ({ name: l.name })) },
    annotation_level: documentLevel ? "document" : undefined,
    documents: task.documents.map((doc) => ({
      name: doc.name,
      full_text: doc.full_text,
      assignments: doc.assignments.map((a) => ({
        annotator: String(a.annotator),
        difficulty_rating: a.confidence,
        annotations: documentLevel
          ? a.document_annotations.map((t) => ({ start: 0, end: 0, label: t.label, text: "" }))
          : a.annotations.map((ann) => ({
              start: ann.start,
              end: ann.end,
              label: ann.label,
              text: ann.text,
            })),
      })),
    })),
  };
}

function allAnnotations(task: TaskData): RichAnnotation[] {
  const out: RichAnnotation[] = [];
  for (const doc of task.documents) {
    for (const assignment of doc.assignments) {
      for (const ann of assignment.annotations) {
        out.push({
          start: ann.start,
          end: ann.end,
          text: ann.text,
          label: ann.label,
          annotator: String(assignment.annotator),
          ann_id: ann.id,
          doc_id: doc.name,
          doc_name: doc.name,
          confidence: ann.confidence,
          metadata: ann.metadata ?? undefined,
        });
      }
    }
  }
  return out;
}

/**
 * Metrics over a task held in memory. Filtering is an array filter here rather
 * than a query — the whole task is already in the browser, so there is nothing
 * to ask a server for. Computing still calls the Go service, which needs no
 * storage of its own: it is handed the task and returns a report.
 */
export function createSessionMetricsSource(task: TaskData): MetricsSource {
  return {
    getLabels(): LabelOption[] {
      return task.labelset.labels.map((l) => ({ name: l.name, color: l.color }));
    },

    getAnnotators(): string[] {
      const seen = new Set<string>();
      for (const doc of task.documents) {
        for (const a of doc.assignments) seen.add(String(a.annotator));
      }
      return [...seen].sort();
    },

    getDocuments(): DocumentOption[] {
      return task.documents.map((d) => ({ value: d.name, label: d.name }));
    },

    async getAnnotations(filters: AnnotationFilters): Promise<RichAnnotation[]> {
      const { labels, documents, annotators } = filters;
      return allAnnotations(task).filter(
        (a) =>
          (labels.length === 0 || labels.includes(a.label)) &&
          (documents.length === 0 || documents.includes(a.doc_id)) &&
          (annotators.length === 0 || annotators.includes(a.annotator)),
      );
    },

    async getIaaInputData(): Promise<IaaInputData> {
      return toIaaInput(task);
    },

    async computeMetrics(input: IaaInputData, p: IaaParams): Promise<IaaMetricsResponse> {
      const res = await callService("lawnotation-iaa", "metrics", { ...p }, input);
      return res.json() as Promise<IaaMetricsResponse>;
    },

    async downloadReport(input: IaaInputData, p: IaaParams): Promise<Blob> {
      const res = await callService("lawnotation-iaa", "report.zip", { ...p }, input);
      return res.blob();
    },
  };
}
