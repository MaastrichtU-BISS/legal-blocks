<script setup lang="ts">
// Sign-in on the board. Not a step: it has no settings and nothing to mount,
// so it is drawn like one but cannot be selected.

import ModuleIcon from "./ModuleIcon.vue";

defineProps<{ compact?: boolean }>();
const emit = defineEmits<{ remove: [] }>();
</script>

<template>
  <div class="card" :class="{ compact }">
    <button class="close" title="Remove sign-in" @click="emit('remove')">×</button>
    <span class="ico"><ModuleIcon name="user" :size="compact ? 16 : 26" /></span>
    <strong>Sign-in</strong>
  </div>
</template>

<style scoped>
.card {
  position: relative;
  width: 9.5rem;
  min-height: 6.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.9rem 0.6rem;
  border: 1px dashed var(--accent-live);
  border-radius: var(--radius-sm, 2px);
  background: var(--surface);
}

.card.compact {
  width: auto;
  min-height: 0;
  flex-direction: row;
  padding: 0.25rem 1.6rem 0.25rem 0.6rem;
  border-radius: var(--radius-full, 9999px);
  font-size: 0.85rem;
}

.ico {
  display: inline-flex;
  color: var(--accent-live);
}

.close {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  width: 1.2rem;
  height: 1.2rem;
  padding: 0;
  line-height: 1;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  opacity: 0;
}

.compact .close {
  top: 50%;
  transform: translateY(-50%);
}

.card:hover .close,
.close:focus-visible {
  opacity: 1;
}

.close:hover {
  background: var(--rule);
  color: var(--danger);
}
</style>
