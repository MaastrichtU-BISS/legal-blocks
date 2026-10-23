<script setup lang="ts">
// The front door. Explains what Legal Blocks is and what you can build, then
// hands off to the composer. Keeping this separate from Composer.vue means the
// composer stays a tool and this stays a page.

const emit = defineEmits<{ start: [] }>();
</script>

<template>
  <div class="landing lb-ui">
    <header class="landing-header">
      <span class="brand">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
          <path d="M10 6.5h4" />
          <path d="M6.5 10v4" />
          <path d="M17.5 10v4" />
        </svg>
        Legal Blocks
      </span>
      <span class="muted small">v0.8.1</span>
    </header>

    <main class="landing-main">
      <section class="hero">
        <h1>Compose platforms out of existing packages.</h1>
        <p class="lede">
          Pick modules, chain them, export a zip. Your colleague runs
          <code>docker compose up</code> and has a working platform. Nothing is
          compiled at export time — the zip is about 2&nbsp;KB.
        </p>
        <div class="cta-row">
          <button class="primary live" @click="emit('start')">Compose a platform</button>
          <a class="ghost-link" href="https://github.com/MaastrichtU-BISS/legal-blocks" target="_blank" rel="noreferrer">Source &amp; docs ↗</a>
        </div>
      </section>

      <section class="shapes">
        <div class="shape">
          <h2>Pipeline</h2>
          <p class="muted small">Runs start to finish, keeps nothing.</p>
          <div class="schematic">
            <span class="node">Search</span>
            <span class="arrow">→</span>
            <span class="node">Explore</span>
          </div>
          <p>Each step reads what the step before it produced. Work lives in the
            browser for one session and leaves through a download. Good for a
            case-law explorer.</p>
        </div>
        <div class="shape">
          <h2>Workspace</h2>
          <p class="muted small">Everything is stored. Several people share it.</p>
          <div class="schematic schematic-ring">
            <span class="node">Annotate</span>
            <span class="node store">Database</span>
            <span class="node">Agreement</span>
          </div>
          <p>Every tool reaches the same database. People upload their own
            documents, define their own labels, create their own tasks. The work
            survives between visits.</p>
        </div>
      </section>

      <section class="how">
        <h2>How a module joins in</h2>
        <p>Each module ships a small manifest describing what it is, what it
          reads and what it writes. Neither the composer nor the platform knows
          any module by name — adding one is adding a file.</p>
        <ul class="ports">
          <li><span class="port">corpus@1</span> text to work on</li>
          <li><span class="port">document-set@1</span> case law with dates, courts, citations</li>
          <li><span class="port">annotated-task@1</span> a task, by reference</li>
        </ul>
        <p class="muted small">
          Ports are typed. The composer only lets you place a step where the one
          before it produces something that step can read, so a platform that
          could not run cannot be built.
        </p>
      </section>

      <section class="foot">
        <p class="muted small">
          No login yet. Everything is owned by one account, which is why an export
          publishes only to <code>127.0.0.1</code>. See the architecture note for
          the gaps.
        </p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.landing {
  min-height: 100vh;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--font-body);
}

.landing-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md, 16px) var(--space-xl, 32px);
  border-bottom: 1px solid var(--rule);
  background: var(--surface);
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
}

.landing-main {
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--space-2xl, 48px) var(--space-xl, 32px);
  display: flex;
  flex-direction: column;
  gap: var(--space-2xl, 48px);
}

.hero h1 {
  font-family: var(--font-display);
  font-size: clamp(32px, 5vw, 52px);
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 1.05;
  max-width: 18ch;
}

.lede {
  margin-top: var(--space-md, 16px);
  font-size: 16px;
  color: var(--muted);
  max-width: 52ch;
  line-height: 1.5;
}

.lede code {
  font-family: var(--font-mono);
  font-size: 14px;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm, 2px);
  padding: 1px 6px;
}

.cta-row {
  display: flex;
  align-items: center;
  gap: var(--space-md, 16px);
  margin-top: var(--space-lg, 24px);
  flex-wrap: wrap;
}

button.primary.live {
  background: var(--accent-live);
  border-color: var(--accent-live);
  color: #fff;
  font-size: 14px;
  padding: 12px 20px;
  border-radius: var(--radius-sm, 2px);
  border: 1px solid var(--accent-live);
  cursor: pointer;
  font-family: var(--font-body);
  font-weight: 600;
}

button.primary.live:hover {
  opacity: 0.9;
}

.ghost-link {
  color: var(--accent-interactive);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
}

.ghost-link:hover {
  text-decoration: underline;
}

.shapes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--space-lg, 24px);
}

.shape {
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md, 4px);
  padding: var(--space-lg, 24px);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm, 8px);
}

.shape h2 {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  margin: 0;
}

.schematic {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  padding: var(--space-md, 16px) 0;
}

.schematic .node {
  background: var(--ground);
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm, 2px);
  padding: 6px 12px;
  font-family: var(--font-mono);
  font-size: 12px;
}

.schematic .node.store {
  border-color: var(--accent-live);
  color: var(--accent-live);
}

.schematic .arrow {
  color: var(--accent-live);
  font-family: var(--font-mono);
}

.shape p {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.5;
}

.how h2 {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 600;
  margin: 0 0 var(--space-sm, 8px);
}

.how p {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.5;
  max-width: 60ch;
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
}

.port {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--surface);
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm, 2px);
  padding: 2px 8px;
  color: var(--ink);
}

.foot {
  border-top: 1px solid var(--rule);
  padding-top: var(--space-lg, 24px);
}

.muted {
  color: var(--muted);
}

.small {
  font-size: 0.9em;
}

code {
  font-family: var(--font-mono);
}
</style>