<script setup lang="ts">
const emit = defineEmits<{ back: []; compose: []; docs: [] }>();
</script>

<template>
  <div class="page lb-ui">
    <header class="page-header">
      <span class="brand" @click="emit('back')">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1" fill="#E3000B" stroke="#1A1A1A" stroke-width="2" />
          <rect x="14" y="3" width="7" height="7" rx="1" fill="#0057A3" stroke="#1A1A1A" stroke-width="2" />
          <rect x="3" y="14" width="7" height="7" rx="1" fill="#00852B" stroke="#1A1A1A" stroke-width="2" />
          <rect x="14" y="14" width="7" height="7" rx="1" fill="#14B8A6" stroke="#1A1A1A" stroke-width="2" />
        </svg>
        Legal Blocks
      </span>
      <nav class="page-nav">
        <button class="nav-link" @click="emit('back')">Home</button>
        <button class="nav-link active">About</button>
        <button class="nav-link" @click="emit('docs')">Docs</button>
        <a class="github-link" href="https://github.com/MaastrichtU-BISS/legal-blocks" target="_blank" rel="noreferrer" aria-label="GitHub">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.44 9.79 8.2 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.54-1.38-1.33-1.75-1.33-1.75-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57C20.57 21.79 24 17.31 24 12 24 5.37 18.63 0 12 0z"/></svg>
        </a>
        <button class="primary" @click="emit('compose')">Compose →</button>
      </nav>
    </header>

    <main class="page-main">
      <section class="hero">
        <h1>About Legal Blocks</h1>
        <p class="lede">
          Legal Blocks is a free, open-source tool for building research platforms.
          Snap together ready-made modules — search, annotation, agreement metrics —
          and share a working app with your team in minutes.
        </p>
      </section>

      <section class="dummy">
        <h2>Our mission</h2>
        <p>We believe research tools should be reusable, not rebuilt from scratch.
          Legal Blocks is the linking layer that lets existing packages become
          platforms anyone can run.</p>
        <p class="muted small">(This is a placeholder page. Real content coming soon.)</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--font-body);
}
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md, 16px) var(--space-xl, 32px);
  border-bottom: 2px solid var(--ink);
  background: var(--surface);
  flex-wrap: wrap;
  gap: var(--space-sm, 8px);
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 20px;
  color: var(--ink);
  cursor: pointer;
}
.page-nav {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  flex-wrap: wrap;
}
.nav-link {
  background: transparent;
  border: 0;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 14px;
  color: var(--ink);
  cursor: pointer;
  padding: 6px 10px;
  border-radius: var(--radius-sm, 0px);
}
.nav-link.active {
  background: var(--accent-live);
  color: #fff;
}
.nav-link:hover {
  background: var(--surface);
}
.github-link {
  display: inline-flex;
  align-items: center;
  color: var(--ink);
  padding: 6px;
}
.github-link:hover {
  color: var(--accent-interactive);
}
.page-main {
  max-width: 900px;
  margin: 0 auto;
  padding: var(--space-2xl, 48px) var(--space-xl, 32px);
  display: flex;
  flex-direction: column;
  gap: var(--space-xl, 32px);
}
.hero h1 {
  font-family: var(--font-display);
  font-size: clamp(32px, 5vw, 48px);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.05;
  color: var(--ink);
}
.lede {
  margin-top: var(--space-md, 16px);
  font-size: 18px;
  color: var(--muted);
  max-width: 52ch;
  line-height: 1.5;
}
.dummy h2 {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 800;
  color: var(--ink);
  margin: 0 0 var(--space-sm, 8px);
}
.dummy p {
  color: var(--muted);
  font-size: 15px;
  line-height: 1.6;
  max-width: 60ch;
}
.muted { color: var(--muted); }
.small { font-size: 0.9em; }
button.primary {
  background: var(--accent-live);
  border: 2px solid var(--ink);
  color: #fff;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 16px;
  padding: 12px 24px;
  border-radius: var(--radius-sm, 0px);
  cursor: pointer;
  box-shadow: 4px 4px 0 var(--ink);
}
button.primary:hover { transform: translate(-2px, -2px); box-shadow: 6px 6px 0 var(--ink); }
</style>