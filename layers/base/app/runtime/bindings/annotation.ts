// legal-annotation-kit. The same component both ways; only the source differs.

import type { TaskData } from "legal-annotation-kit";
import { createAnnotationSource } from "../../sources/annotation";
import { loadMetricsTask } from "../../sources/metrics";
import { buildTask, collectTask, createSessionAnnotationSource } from "../../sources/memory";
import type { BindingContext, CorpusValue, KindBindings, TaskValue } from "./types";
import { documentsOf, requireTask } from "./values";

export const AnnotationSource: KindBindings = {
  workspace: {
    async props(ctx) {
      const taskId = requireTask(ctx);
      const [queue, task] = await Promise.all([
        createAnnotationSource(taskId, ctx.annotator),
        loadMetricsTask(taskId),
      ]);
      return {
        source: queue.source,
        labelset: task.labelset,
        annotationLevel: task.annotation_level,
        guidelinesUrl: task.ann_guidelines || undefined,
        // Opening the annotate step with nothing chosen means "carry on", not
        // "start again at document one" — the queue is long and the first
        // document is the least likely one somebody wants.
        startPosition: ctx.startPosition ?? queue.resumeAt,
        // AnnotatorQueue emits `complete` when the last document is saved.
        // v-bind turns an onX prop into a listener, which is how a binding gets
        // to hand the host a callback without ModuleHost knowing any module's
        // events.
        onComplete: () => ctx.finished?.(),
      };
    },
    async output(ctx): Promise<TaskValue> {
      return { kind: "task", taskId: requireTask(ctx) };
    },
  },

  pipeline: {
    async props(ctx) {
      const task = await sessionTask(ctx);
      return {
        source: createSessionAnnotationSource(ctx.nodeId, task, ctx.annotator),
        labelset: task.labelset,
        annotationLevel: task.annotation_level,
        guidelinesUrl: String(ctx.config.guidelines_url ?? "") || undefined,
      };
    },
    async output(ctx): Promise<TaskValue> {
      const corpus = await documentsOf((await ctx.input("corpus")) as CorpusValue);
      return { kind: "session", nodeId: ctx.nodeId, task: buildTask(corpus, ctx.config) };
    },
  },
};

/** The session task this annotate step works on, with saved work merged in. */
async function sessionTask(ctx: BindingContext): Promise<TaskData> {
  const corpus = await documentsOf((await ctx.input("corpus")) as CorpusValue);
  return collectTask(ctx.nodeId, buildTask(corpus, ctx.config));
}
