// MetricsSource — the data-access contract vue-iaa-metrics asks its host to
// implement.
//
// Filtering is a query now rather than an array filter in the browser: the
// package asks for "annotations matching these filters" and gets exactly those
// rows back, instead of the whole task being loaded so it can be narrowed
// client-side.
//
// The package's own note says computeMetrics and downloadReport are
// host-implemented because the Go IAA service has no CORS or auth handling and
// was never meant to be called from a browser. Compiled into the platform
// binary it is same-origin, so the host calls it directly.

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
import {
  callService,
  getAnnotations,
  getIaaInput,
  getTask,
  getTaskAnnotators,
  getTaskDocuments,
  type Task,
} from "../api";

const SERVICE_ID = "lawnotation-iaa";

/**
 * Builds a source over a task.
 *
 * Criterion and granularity are deliberately not parameters. They are
 * properties of a question a user asks — "would these annotators agree if I
 * accepted contained matches?" — so they belong to the request, not to the
 * platform. The package puts them in front of the user and passes the current
 * values in with every call; this forwards them.
 */
export function createMetricsSource(taskId: number, task: Task): MetricsSource {
  return {
    getLabels(): LabelOption[] {
      return task.labelset.labels.map((l) => ({ name: l.name, color: l.color }));
    },

    async getAnnotators(): Promise<string[]> {
      return getTaskAnnotators(taskId);
    },

    async getDocuments(): Promise<DocumentOption[]> {
      return getTaskDocuments(taskId);
    },

    async getAnnotations(filters: AnnotationFilters): Promise<RichAnnotation[]> {
      return (await getAnnotations(taskId, filters)) as RichAnnotation[];
    },

    async getIaaInputData(): Promise<IaaInputData> {
      return (await getIaaInput(taskId)) as IaaInputData;
    },

    async computeMetrics(input: IaaInputData, p: IaaParams): Promise<IaaMetricsResponse> {
      const res = await callService(SERVICE_ID, "metrics", { ...p }, input);
      return res.json() as Promise<IaaMetricsResponse>;
    },

    async downloadReport(input: IaaInputData, p: IaaParams): Promise<Blob> {
      const res = await callService(SERVICE_ID, "report.zip", { ...p }, input);
      return res.blob();
    },
  };
}

/** Loads the task a metrics step reports on. */
export async function loadMetricsTask(taskId: number): Promise<Task> {
  return getTask(taskId);
}
