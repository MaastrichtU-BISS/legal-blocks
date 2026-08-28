<script setup lang="ts">
// The pictures behind the manifest's `icon` names.
//
// The vocabulary lives here and the choice lives in each manifest, which is the
// only arrangement that keeps module names out of composer code: this file
// knows what "upload" looks like, not which module is the uploader.
//
// Drawn inline rather than pulled from an icon package. There are six of them,
// they never change, and a dependency that ships two thousand glyphs to deliver
// six is a poor trade in a bundle somebody downloads to design one platform.

defineProps<{ name?: string; size?: number }>();
</script>

<template>
  <svg
    :width="size ?? 20"
    :height="size ?? 20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- Files arriving from a machine. -->
    <template v-if="name === 'upload'">
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </template>

    <!-- Looking something up somewhere else. -->
    <template v-else-if="name === 'search'">
      <circle cx="11" cy="11" r="6" />
      <path d="m20 20-4.5-4.5" />
    </template>

    <!-- Marking up a text: a highlighted run with a tag on it. -->
    <template v-else-if="name === 'annotate'">
      <path d="M4 7h10" />
      <path d="M4 12h6" />
      <path d="M4 17h8" />
      <rect x="13" y="10" width="8" height="6" rx="1.5" />
    </template>

    <!-- Numbers about the work, rather than the work. -->
    <template v-else-if="name === 'chart'">
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </template>

    <!-- Documents that cite each other. -->
    <template v-else-if="name === 'graph'">
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8.2 8.6 10.6 15.8" />
      <path d="M16.3 8 13.4 16" />
      <path d="M8.4 6.6h7.2" />
    </template>

    <!-- Storage: what makes a platform a workspace. -->
    <template v-else-if="name === 'database'">
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3" />
    </template>

    <!-- Something the composer has no picture for. A shape, not a guess. -->
    <template v-else>
      <rect x="4" y="4" width="16" height="16" rx="3" />
    </template>
  </svg>
</template>
