<script setup lang="ts">
// The student's ML workbench: datasets, models, training and prediction.
//
// Annotation is left out on purpose. The platform has its own, and the
// builder's AnnotationWorkspace is the one component that would call the
// annotation operations, which the platform does not forward.

import { provide, ref } from "vue";
import {
  DatasetManager,
  ModelCreateWizard,
  ModelDetail,
  ModelList,
  TrainingMonitor,
} from "vue-legal-ml-builder";
import type { MLAdapter } from "vue-legal-ml-builder";

const props = defineProps<{
  adapter: MLAdapter;
  /** Opens straight at this model's page, where it can be tried. */
  modelId?: string;
}>();

/**
 * The job each model was last started with. The wizard starts training itself
 * and reports only the model, and without the job the monitor cannot follow
 * the run, so the adapter remembers it on the way through.
 */
const jobs = new Map<string, string>();
const adapter: MLAdapter = {
  ...props.adapter,
  async startTraining(modelId, options) {
    const started = await props.adapter.startTraining(modelId, options);
    jobs.set(String(modelId), String(started.job_id));
    return started;
  },
};

// The builder's inner components (training curves, charts) find the adapter
// by injection rather than by prop.
provide("vmlb:adapter", adapter);
provide("vmlb:pollInterval", 3000);
provide("vmlb:hideAnnotation", true);

type View =
  | { name: "datasets" }
  | { name: "models" }
  | { name: "create"; datasetId?: string }
  | { name: "train"; modelId: string }
  | { name: "detail"; modelId: string };

const view = ref<View>(
  props.modelId ? { name: "detail", modelId: props.modelId } : { name: "datasets" },
);

const sections = [
  { name: "datasets", label: "Datasets" },
  { name: "models", label: "Models" },
] as const;

function idOf(item: unknown): string {
  return String((item as { id: string | number }).id);
}
</script>

<template>
  <div class="vmlb-theme ml-workbench">
    <nav class="sections" aria-label="Machine learning">
      <button
        v-for="s in sections"
        :key="s.name"
        :class="{ active: view.name === s.name }"
        :aria-current="view.name === s.name ? 'page' : undefined"
        @click="view = { name: s.name }"
      >
        {{ s.label }}
      </button>
    </nav>

    <DatasetManager
      v-if="view.name === 'datasets'"
      :adapter="adapter"
      @create-model="(d) => (view = { name: 'create', datasetId: idOf(d) })"
    />
    <ModelList
      v-else-if="view.name === 'models'"
      :adapter="adapter"
      @create="view = { name: 'create' }"
      @view="(m) => (view = { name: 'detail', modelId: idOf(m) })"
      @train="(m) => (view = { name: 'train', modelId: idOf(m) })"
    />
    <ModelCreateWizard
      v-else-if="view.name === 'create'"
      :adapter="adapter"
      :dataset-id="view.datasetId"
      @created="(m) => (view = { name: 'train', modelId: idOf(m) })"
      @cancel="view = { name: 'models' }"
    />
    <TrainingMonitor
      v-else-if="view.name === 'train'"
      :adapter="adapter"
      :model-id="view.modelId"
      :job-id="jobs.get(view.modelId)"
      @complete="view = { name: 'detail', modelId: (view as { modelId: string }).modelId }"
    />
    <ModelDetail
      v-else-if="view.name === 'detail'"
      :adapter="adapter"
      :model-id="view.modelId"
      @train="view = { name: 'train', modelId: (view as { modelId: string }).modelId }"
    />
  </div>
</template>

<style scoped>
/* The builder's tokens, pointed at the platform's, so it reads as part of the
   platform rather than a page embedded in it. */
.ml-workbench {
  --vmlb-canvas: var(--ground);
  --vmlb-surface: var(--ground);
  --vmlb-surface-sunken: var(--surface);
  --vmlb-border: var(--rule);
  --vmlb-border-strong: var(--field-edge);
  --vmlb-text: var(--ink);
  --vmlb-text-muted: var(--muted);
  --vmlb-accent: var(--accent-interactive);
  --vmlb-accent-strong: var(--accent-interactive);
  --vmlb-accent-soft: color-mix(in srgb, var(--accent-interactive) 14%, transparent);
  --vmlb-on-accent: var(--on-accent);
  --vmlb-success: var(--success);
  --vmlb-success-soft: color-mix(in srgb, var(--success) 14%, transparent);
  --vmlb-warning: var(--warning);
  --vmlb-warning-soft: color-mix(in srgb, var(--warning) 14%, transparent);
  --vmlb-error: var(--danger);
  --vmlb-error-soft: color-mix(in srgb, var(--danger) 14%, transparent);
  --vmlb-font-display: var(--font-display);
  --vmlb-font-sans: var(--font-body);
  --vmlb-font-mono: var(--font-mono);
  --vmlb-label-case: none;
  --vmlb-label-tracking: 0;
  --vmlb-radius-sm: var(--radius-sm);
  --vmlb-radius-md: var(--radius-md);
  --vmlb-radius-lg: var(--radius-lg);

  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  width: 100%;
  color: var(--ink);
  font-family: var(--font-body);
}

.sections {
  display: flex;
  gap: var(--space-sm);
  border-bottom: 1px solid var(--rule);
}

.sections button {
  font: inherit;
  font-weight: 600;
  font-size: 0.875rem;
  padding: var(--space-sm) var(--space-xs);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--muted);
  cursor: pointer;
}

.sections button.active {
  color: var(--ink);
  border-bottom-color: var(--accent-interactive);
}

.sections button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}
</style>
