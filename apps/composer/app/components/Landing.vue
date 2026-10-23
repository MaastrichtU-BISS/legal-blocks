<script setup lang="ts">
// The front door. Explains what Legal Blocks is in plain language, then
// hands off to the composer. Keeping this separate from Composer.vue means the
// composer stays a tool and this stays a page.

const emit = defineEmits<{ start: []; about: []; docs: [] }>();
</script>

<template>
  <div class="landing lb-ui">
    <header class="landing-header">
      <span class="brand">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1" fill="#E3000B" stroke="#1A1A1A" stroke-width="2" />
          <rect x="14" y="3" width="7" height="7" rx="1" fill="#0057A3" stroke="#1A1A1A" stroke-width="2" />
          <rect x="3" y="14" width="7" height="7" rx="1" fill="#00852B" stroke="#1A1A1A" stroke-width="2" />
          <rect x="14" y="14" width="7" height="7" rx="1" fill="#14B8A6" stroke="#1A1A1A" stroke-width="2" />
        </svg>
        Legal Blocks
      </span>
      <nav class="page-nav">
        <button class="nav-link" @click="emit('about')">About</button>
        <button class="nav-link" @click="emit('docs')">Docs</button>
        <a class="github-link" href="https://github.com/MaastrichtU-BISS/legal-blocks" target="_blank" rel="noreferrer" aria-label="GitHub">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.44 9.79 8.2 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.54-1.38-1.33-1.75-1.33-1.75-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57C20.57 21.79 24 17.31 24 12 24 5.37 18.63 0 12 0z"/></svg>
        </a>
      </nav>
    </header>

    <main class="landing-main">
      <section class="hero">
        <div class="hero-brand">
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="3" width="7" height="7" rx="1" fill="#E3000B" stroke="#1A1A1A" stroke-width="2" />
            <rect x="14" y="3" width="7" height="7" rx="1" fill="#0057A3" stroke="#1A1A1A" stroke-width="2" />
            <rect x="3" y="14" width="7" height="7" rx="1" fill="#00852B" stroke="#1A1A1A" stroke-width="2" />
            <rect x="14" y="14" width="7" height="7" rx="1" fill="#14B8A6" stroke="#1A1A1A" stroke-width="2" />
          </svg>
          <span class="hero-brand-name">Legal Blocks</span>
        </div>
        <h1>Build your own research platform.<br />No code required.</h1>
        <p class="lede">
          Pick the tools you need, snap them together like building blocks, and
          share a working app with your team. Takes minutes, not months.
        </p>
        <div class="cta-row">
          <button class="primary" @click="emit('start')">Start building →</button>
        </div>
        <p class="muted small">Free and open source. Runs on your computer.</p>

        <div class="assembly" aria-hidden="true">
          <div class="assembly-track">
            <div class="assembly-block b1">Search</div>
            <div class="assembly-connector c1"><span class="flow-dot"></span></div>
            <div class="assembly-block b2">Annotate</div>
            <div class="assembly-connector c2"><span class="flow-dot"></span></div>
            <div class="assembly-block b3">Agree</div>
          </div>
          <div class="assembly-status">
            <span class="pulse-dot"></span>
            <span>Running in the background…</span>
          </div>
        </div>
      </section>

      <section class="shapes">
        <div class="shape">
          <div class="shape-icon" style="background:#E3000B;">→</div>
          <h2>One-off runs</h2>
          <p>Search, explore, download. Great for a quick look at case law or
            documents. Nothing is saved — just take your results and go.</p>
        </div>
        <div class="shape">
          <div class="shape-icon" style="background:#0D9488;">↔</div>
          <h2>Persistent storage</h2>
          <p>Turn on storage and your platform keeps documents, labels, and tasks
            in a database. Invite colleagues; work survives between visits.</p>
        </div>
        <div class="shape">
          <div class="shape-icon" style="background:#00852B;">✓</div>
          <h2>Measure agreement</h2>
          <p>See how much your annotators agree. Built-in metrics, no setup
            required. Know when your labels are ready.</p>
        </div>
      </section>

      <section class="how">
        <h2>How it works</h2>
        <ol class="steps-list">
          <li>
            <span class="step-num">1</span>
            <div>
              <strong>Pick your tools</strong>
              <p>Choose from search, annotation, agreement metrics, document import,
                and more. Each is a ready-made block.</p>
            </div>
          </li>
          <li>
            <span class="step-num">2</span>
            <div>
              <strong>Snap them together</strong>
              <p>Drag blocks into a pipeline or a workspace. The app checks that
                they fit — you can't build something that won't run.</p>
            </div>
          </li>
          <li>
            <span class="step-num">3</span>
            <div>
              <strong>Export and share</strong>
              <p>Press export. You get a small file. Send it to a colleague; they
                run one command and have your platform.</p>
            </div>
          </li>
        </ol>
      </section>

      <section class="foot">
        <p class="muted small">
          Legal Blocks is free and open source. No account needed to start.
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
  font-weight: 800;
  font-size: 20px;
  color: var(--ink);
}

.landing-main {
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--space-2xl, 48px) var(--space-xl, 32px);
  display: flex;
  flex-direction: column;
  gap: var(--space-2xl, 48px);
}

.hero {
  text-align: left;
}

.hero h1 {
  font-family: var(--font-display);
  font-size: clamp(36px, 6vw, 56px);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.05;
  max-width: 16ch;
  color: var(--ink);
}

.lede {
  margin-top: var(--space-md, 16px);
  font-size: 18px;
  color: var(--muted);
  max-width: 48ch;
  line-height: 1.5;
}

.cta-row {
  margin-top: var(--space-lg, 24px);
}

button.primary {
  background: var(--accent-live);
  border: 2px solid var(--ink);
  color: #fff;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 18px;
  padding: 14px 28px;
  border-radius: var(--radius-sm, 8px);
  cursor: pointer;
  box-shadow: 0 2px 8px rgb(232 90 79 / 0.25);
  transition: transform 120ms ease-out, box-shadow 120ms ease-out;
}

button.primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgb(232 90 79 / 0.3);
}

button.primary:active {
  transform: translateY(1px);
  box-shadow: 0 1px 4px rgb(232 90 79 / 0.2);
}

.shapes {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-lg, 24px);
}

.shape {
  background: var(--surface);
  border: 2px solid var(--ink);
  border-radius: var(--radius-md, 4px);
  padding: var(--space-lg, 24px);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm, 8px);
  box-shadow: 0 4px 12px rgb(31 41 55 / 0.08);
}

.shape-icon {
  width: 40px;
  height: 40px;
  border: 2px solid var(--ink);
  border-radius: var(--radius-sm, 0px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 20px;
  color: #fff;
  box-shadow: 0 2px 6px rgb(31 41 55 / 0.08);
}

.shape h2 {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 800;
  margin: 0;
  color: var(--ink);
}

.shape p {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.5;
}

.how h2 {
  font-family: var(--font-display);
  font-size: 24px;
  font-weight: 800;
  margin: 0 0 var(--space-md, 16px);
  color: var(--ink);
}

.steps-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-md, 16px);
}

.steps-list li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-md, 16px);
}

.step-num {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-full, 9999px);
  background: var(--accent-live);
  color: #fff;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 6px rgb(232 90 79 / 0.25);
}

.steps-list strong {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 16px;
  color: var(--ink);
}

.steps-list p {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.5;
  margin: 4px 0 0;
}

.foot {
  border-top: 2px solid var(--ink);
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

.hero-brand {
  display: flex;
  align-items: center;
  gap: var(--space-sm, 8px);
  margin-bottom: var(--space-md, 16px);
}
.hero-brand-name {
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 18px;
  color: var(--ink);
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

/* Animated assembly preview */
.assembly {
  margin-top: var(--space-xl, 32px);
  background: var(--surface);
  border: 2px solid var(--ink);
  border-radius: var(--radius-md, 4px);
  padding: var(--space-lg, 24px);
  box-shadow: 0 4px 12px rgb(31 41 55 / 0.08);
}
.assembly-track {
  display: flex;
  align-items: center;
  gap: 0;
  justify-content: center;
  flex-wrap: wrap;
}
.assembly-block {
  background: var(--ground);
  border: 2px solid var(--ink);
  border-radius: var(--radius-sm, 0px);
  padding: 10px 18px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 14px;
  color: var(--ink);
  box-shadow: 0 2px 6px rgb(31 41 55 / 0.08);
  animation: snap-in 0.6s ease-out both;
}
.assembly-block.b1 { animation-delay: 0s; background: #E3000B; color: #fff; }
.assembly-block.b2 { animation-delay: 0.2s; background: #0057A3; color: #fff; }
.assembly-block.b3 { animation-delay: 0.4s; background: #00852B; color: #fff; }
.assembly-connector {
  width: 40px;
  height: 2px;
  background: var(--rule);
  position: relative;
  flex-shrink: 0;
  margin: 0 4px;
  animation: fade-in 0.4s ease-out both;
}
.assembly-connector.c1 { animation-delay: 0.1s; }
.assembly-connector.c2 { animation-delay: 0.3s; }
.flow-dot {
  position: absolute;
  top: -3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-live);
  animation: flow 1.6s linear infinite;
}
@keyframes flow { 0% { left: 0; } 100% { left: calc(100% - 8px); } }
@keyframes snap-in {
  0% { opacity: 0; transform: translateY(-12px) scale(0.9); }
  60% { transform: translateY(2px) scale(1.02); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
.assembly-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm, 8px);
  margin-top: var(--space-md, 16px);
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-live);
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.8); } }
@media (prefers-reduced-motion: reduce) {
  .assembly-block, .assembly-connector, .flow-dot, .pulse-dot { animation: none; }
}
</style>