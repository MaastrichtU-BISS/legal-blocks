<script setup lang="ts">
import { useTheme, type ThemePreference } from "@base/composables/useTheme";

const { preference, set } = useTheme();

const options: { value: ThemePreference; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "monitor" },
];

function choose(v: ThemePreference) {
  set(v);
}
</script>

<template>
  <div class="theme-toggle lb-ui" role="group" aria-label="Color theme">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      :class="{ active: preference === opt.value }"
      :aria-pressed="preference === opt.value"
      :title="opt.label"
      @click="choose(opt.value)"
    >
      <svg v-if="opt.icon === 'sun'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
      <svg v-else-if="opt.icon === 'moon'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
      <svg v-else width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.theme-toggle {
  display: inline-flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.theme-toggle button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border: 0;
  border-radius: calc(var(--radius-sm) - 2px);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  box-shadow: none;
}

.theme-toggle button:hover:not(:disabled) {
  color: var(--ink);
  background: var(--bg-soft);
}

.theme-toggle button.active {
  color: var(--ink);
  background: var(--ground);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
}
</style>
