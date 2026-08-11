// MetricsSource — the data-access contract vue-iaa-metrics asks its host to
// implement.
//
// The package's own note says computeMetrics and downloadReport are
// host-implemented because the Go IAA service has no CORS or auth handling and
// was never meant to be called from a browser. Compiled into the platform
// binary it is same-origin, so the host calls it directly and that constraint
// simply stops applying.

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
import type { TaskData } from "legal-annotation-kit";
import { callService } from "../api";

const SERVICE_ID = "lawnotation-iaa";

/**
 * Converts an annotation task into the IAA service's input.
 *
 * The two schemas were designed independently and line up almost exactly —
 * the differences are a field name (confidence / difficulty_rating) and
 * annotator identifiers being numbers on one side and strings on the other.
 * This function is the entire cost of connecting the two packages.
 */
export function toIaaInput(task: TaskData): IaaInputData {
  return {
    labelset: { labels: task.labelset.labels.map((l) => ({ name: l.name })) },
    annotation_level: task.annotation_level as IaaInputData["annotation_level"],
    documents: task.documents.map((doc) => ({
      name: doc.name,
      full_text: doc.full_text,
      assignments: doc.assignments.map((a) => ({
        annotator: String(a.annotator),
        difficulty_rating: a.confidence,
        annotations: a.annotations.map((ann) => ({
          start: ann.start,
          end: ann.end,
          label: ann.label,
          text: ann.text,
        })),
      })),
    })),
  };
}

/** Every annotation in the task, flattened for the browsable list. */
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

export function createMetricsSource(task: TaskData, config: Record<string, unknown>): MetricsSource {
  // The node's configured criterion/granularity are the starting point; the
  // package lets the user change them per computation, and passes the current
  // values back in through IaaParams.
  const defaults: IaaParams = {
    criterion: (config.criterion as IaaParams["criterion"]) ?? "exact",
    granularity: (config.granularity as IaaParams["granularity"]) ?? "word",
  };

  const params = (p?: IaaParams) => ({
    criterion: p?.criterion ?? defaults.criterion,
    granularity: p?.granularity ?? defaults.granularity,
  });

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
      const res = await callService(SERVICE_ID, "metrics", params(p), input);
      return res.json() as Promise<IaaMetricsResponse>;
    },

    async downloadReport(input: IaaInputData, p: IaaParams): Promise<Blob> {
      const res = await callService(SERVICE_ID, "report.zip", params(p), input);
      return res.blob();
    },
  };
}
