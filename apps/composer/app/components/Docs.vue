<script setup lang="ts">
import ThemeToggle from "@base/components/ThemeToggle.vue";
import SquareLockMark from "./SquareLockMark.vue";

const emit = defineEmits<{ back: []; compose: [] }>();
</script>

<template>
  <div class="page lb-ui">
    <header class="page-header">
      <span class="brand" @click="emit('back')">
        <SquareLockMark :size="28" />
        Legal Blocks
      </span>
      <nav class="page-nav">
        <ThemeToggle />
        <button class="nav-link" @click="emit('back')">Home</button>
        <button class="nav-link active">Docs</button>
        <a class="github-link" href="https://github.com/MaastrichtU-BISS/legal-blocks" target="_blank" rel="noreferrer" aria-label="GitHub">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.44 9.79 8.2 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.54-1.38-1.33-1.75-1.33-1.75-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57C20.57 21.79 24 17.31 24 12 24 5.37 18.63 0 12 0z"/></svg>
        </a>
        <button class="primary" @click="emit('compose')">Compose →</button>
      </nav>
    </header>

    <main class="page-main">
      <section class="hero">
        <h1>How Legal Blocks works</h1>
        <p class="lede">
          Modules describe themselves. The composer lets you join them where the
          data one produces is data the next can read. The platform runs the
          application you designed.
        </p>
      </section>

      <section class="doc">
        <h2>Pipelines</h2>
        <p>A pipeline runs start to finish and keeps nothing. Search → Explore.
          Each step reads what the step before it produced. Work stays in the
          browser for one session and leaves through a download.</p>
      </section>

      <section class="doc">
        <h2>Applications with persistent data</h2>
        <p>Enable storage when people need to return to their work. Add document
          import, annotation and agreement modules. When the application runs,
          upload documents, define labels, create tasks and assign annotators.
          Records are stored in a shared database and survive between visits.</p>
      </section>

      <section class="doc">
        <h2>Example applications</h2>
        <ul class="ports">
          <li><span class="port">Search documents → Explore documents</span> case-law search and citation graph</li>
          <li><span class="port">Import documents → Annotate → Agreement metrics</span> one-session annotation</li>
          <li><span class="port">Import + Annotate + Agreement metrics</span> shared, persistent annotation workflow</li>
        </ul>
        <p>In a pipeline, arrange modules in data-flow order. With persistent data,
          the modules are tools over shared records rather than a linear chain.</p>
      </section>

      <section class="doc">
        <h2>Export</h2>
        <p>Press export and you get a small zip: a compose file, your design, and
          a README. Your colleague runs <code>docker compose up</code> and has a
          working platform. Nothing is compiled at export time.</p>
      </section>

      <section class="doc">
        <h2>Modules</h2>
        <p>Each module is described by a manifest saying what it is, what it
          reads, and what it writes. The manifest describes typed ports and a component
          entry. Adding an existing npm package also requires a build dependency,
          explicit loader import, registry entry and compatible host binding.</p>
        <ul class="ports">
          <li><span class="port">corpus@1</span> text to work on</li>
          <li><span class="port">document-set@1</span> case law with dates, courts, citations</li>
          <li><span class="port">annotated-task@1</span> a task, by reference</li>
        </ul>
      </section>

      <section class="doc">
        <h2>Using npm and Git packages</h2>
        <p>npm registry packages and Git repositories can be installed as
          build-time dependencies. That alone does not make one selectable in the
          composer or install it into an exported application at runtime.</p>
        <p>For a Vue package, add it to the base layer, map its component and
          stylesheet in <code>loaders.ts</code>, describe it in a manifest under
          <code>registry/</code>, and reuse or implement a host binding. Test and
          release a platform image containing it. Server libraries should be
          called from named API operations; separate runtimes should be declared
          as services.</p>
        <p>See the <a href="https://github.com/MaastrichtU-BISS/legal-blocks/blob/main/docs/overview.md">module conversion guide</a>
          for details and an install example.</p>
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
.doc h2 {
  font-family: var(--font-display);
  font-size: 22px;
  font-weight: 800;
  color: var(--ink);
  margin: 0 0 var(--space-sm, 8px);
}
.doc p {
  color: var(--muted);
  font-size: 15px;
  line-height: 1.6;
  max-width: 60ch;
}
.doc a {
  color: var(--accent-interactive);
}
.doc a:hover {
  color: var(--ink);
}
.ports {
  list-style: none;
  padding: 0;
  margin: var(--space-md, 16px) 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xs, 4px);
}
.ports li {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  font-size: 14px;
  color: var(--muted);
}
.port {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--surface);
  border: 2px solid var(--ink);
  border-radius: var(--radius-sm, 0px);
  padding: 2px 8px;
  color: var(--ink);
  box-shadow: 2px 2px 0 var(--ink);
}
code {
  font-family: var(--font-mono);
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm, 0px);
  padding: 1px 6px;
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
