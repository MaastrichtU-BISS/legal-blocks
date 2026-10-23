<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), {
  size: 28,
});
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 60 60"
    fill="none"
    aria-hidden="true"
    focusable="false"
  >
    <!-- Coral L and teal J tetrominoes form the square-lock silhouette. -->
    <g fill="#E85A4F">
      <rect x="0" y="0" width="20" height="20" />
      <rect x="0" y="20" width="20" height="20" />
      <rect x="0" y="40" width="20" height="20" />
      <rect x="20" y="40" width="20" height="20" />
    </g>
    <g fill="#0D9488">
      <rect x="20" y="0" width="20" height="20" />
      <rect x="40" y="0" width="20" height="20" />
      <rect x="40" y="20" width="20" height="20" />
      <rect x="40" y="40" width="20" height="20" />
    </g>
    <path
      d="M0 20h20M0 40h20M20 40v20M40 0v20M40 20h20M40 40h20"
      stroke="rgb(255 255 255 / 22%)"
      stroke-width="1.5"
    />
  </svg>
</template>
