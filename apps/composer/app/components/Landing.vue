<script setup lang="ts">
// The front door. Explains what Legal Blocks is in plain language, then
// hands off to the composer. Keeping this separate from Composer.vue means the
// composer stays a tool and this stays a page.

const emit = defineEmits<{ start: [] }>();
</script>

<template>
  <div class="landing lb-ui">
    <header class="landing-header">
      <span class="brand">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1" fill="#FFD500" stroke="#1A1A1A" />
          <rect x="14" y="3" width="7" height="7" rx="1" fill="#0057A3" stroke="#1A1A1A" />
          <rect x="3" y="14" width="7" height="7" rx="1" fill="#00852B" stroke="#1A1A1A" />
          <rect x="14" y="14" width="7" height="7" rx="1" fill="#E3000B" stroke="#1A1A1A" />
        </svg>
        Legal Blocks
      </span>
    </header>

    <main class="landing-main">
      <section class="hero">
        <h1>Build your own research platform.<br />No code required.</h1>
        <p class="lede">
          Pick the tools you need, snap them together like building blocks, and
          share a working app with your team. Takes minutes, not months.
        </p>
        <div class="cta-row">
          <button class="primary" @click="emit('start')">Start building →</button>
        </div>
        <p class="muted small">Free and open source. Runs on your computer.</p>
      </section>

      <section class="shapes">
        <div class="shape">
          <div class="shape-icon" style="background:#E3000B;">→</div>
          <h2>One-off runs</h2>
          <p>Search, explore, download. Great for a quick look at case law or
            documents. Nothing is saved — just take your results and go.</p>
        </div>
        <div class="shape">
          <div class="shape-icon" style="background:#0057A3;">↔</div>
          <h2>Shared workspaces</h2>
          <p>Upload documents, define labels, create tasks, invite colleagues.
            Everyone works on the same data. Your work survives between visits.</p>
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
  border-bottom: 2px solid var(--ink);
  background: var(--accent-warm);
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
  border-radius: var(--radius-sm, 0px);
  cursor: pointer;
  box-shadow: 4px 4px 0 var(--ink);
  transition: transform 120ms ease-out, box-shadow 120ms ease-out;
}

button.primary:hover {
  transform: translate(-2px, -2px);
  box-shadow: 6px 6px 0 var(--ink);
}

button.primary:active {
  transform: translate(2px, 2px);
  box-shadow: 2px 2px 0 var(--ink);
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
  box-shadow: 4px 4px 0 var(--ink);
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
  box-shadow: 2px 2px 0 var(--ink);
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
  border: 2px solid var(--ink);
  border-radius: var(--radius-sm, 0px);
  background: var(--accent-warm);
  color: var(--ink);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 2px 2px 0 var(--ink);
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
</style>