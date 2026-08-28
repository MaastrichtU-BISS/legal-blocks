// vue-iaa-metrics. Reads the task the annotate step produced and passes it
// through: a report is computed on demand and downloaded, never handed to a
// later step, so the task is what continues along the chain.
//
// The agreement service needs no storage either way — it is given a task and
// returns a report — so this module works in both modes untouched.

import type { TaskData } from "legal-annotation-kit";
import { createMetricsSource, loadMetricsTask } from "../../sources/metrics";
import { collectTask, createSessionMetricsSource } from "../../sources/memory";
import type { BindingContext, KindBindings, TaskValue } from "./types";
import { requireTask } from "./values";

export const MetricsSource: KindBindings = {
  workspace: {
    async props(ctx) {
      const taskId = requireTask(ctx);
      const task = await loadMetricsTask(taskId);
      return {
        source: createMetricsSource(taskId, task),
        reportFilename: `${task.name || "iaa"}-report.zip`,
      };
    },
    async output(ctx): Promise<TaskValue> {
      return { kind: "task", taskId: requireTask(ctx) };
    },
  },

  pipeline: {
    async props(ctx) {
      const task = await sessionTaskFrom(ctx);
      return {
        source: createSessionMetricsSource(task),
        reportFilename: `${task.name || "iaa"}-report.zip`,
      };
    },
    async output(ctx): Promise<TaskValue> {
      return (await ctx.input("task")) as TaskValue;
    },
  },
};

/**
 * The session task this step is reporting on: the skeleton that arrived on the
 * port, with every annotator's saved work merged into it. The ephemeral
 * counterpart of reading a task back out of the database.
 */
async function sessionTaskFrom(ctx: BindingContext): Promise<TaskData> {
  const value = (await ctx.input("task")) as TaskValue;
  if (value.kind !== "session") throw new Error("expected a session task");
  return collectTask(value.nodeId, value.task);
}
