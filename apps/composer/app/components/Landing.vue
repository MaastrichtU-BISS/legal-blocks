<script setup lang="ts">
// The front door. Explains what Legal Blocks is in plain language, then
// hands off to the composer. Keeping this separate from Composer.vue means the
// composer stays a tool and this stays a page.
//
// The hero shows the composer itself (public/composer-pipeline.png: the board
// and settings of /compose at 1200px, 2x, with Import documents, Annotate and
// Agreement metrics joined and Annotate chosen), not a drawing of it.
// Recapture it when the composer's look changes.

import ThemeToggle from "@base/components/ThemeToggle.vue";
import SquareLockMark from "./SquareLockMark.vue";

const emit = defineEmits<{ start: []; docs: [] }>();
</script>

<template>
  <div class="landing lb-ui">
    <header class="landing-header">
      <div class="bar">
        <span class="brand">
          <SquareLockMark :size="28" />
          Legal Blocks
        </span>
        <nav class="page-nav">
          <ThemeToggle />
          <button class="nav-link" @click="emit('docs')">Docs</button>
          <a class="github-link" href="https://github.com/MaastrichtU-BISS/legal-blocks" target="_blank" rel="noreferrer" aria-label="GitHub">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.44 9.79 8.2 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.54-1.38-1.33-1.75-1.33-1.75-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57C20.57 21.79 24 17.31 24 12 24 5.37 18.63 0 12 0z"/></svg>
          </a>
        </nav>
      </div>
    </header>

    <main class="landing-main">
      <section class="hero">
        <div class="hero-copy">
          <h1>Build your own research platform.<br /><span class="h1-line2">No code required.</span></h1>
          <p class="lede">
            Pick the tools you need, snap them together like building blocks, and
            share a working app with your team. Takes minutes, not months.
          </p>
          <div class="cta-row">
            <button class="primary" @click="emit('start')">Start building</button>
          </div>
          <p class="muted small">Free and open source. Runs on your computer.</p>
        </div>
        <figure class="product">
          <img
            src="/composer-pipeline.png"
            width="880"
            height="600"
            alt="The composer with three steps joined: Import documents, Annotate and Agreement metrics, with the Annotate step's settings open."
          />
        </figure>
      </section>

      <section class="shapes">
        <div class="shape">
          <h2>One-off runs</h2>
          <p>Search, explore, download. Great for a quick look at case law or
            documents. Nothing is saved: take your results and go.</p>
        </div>
        <div class="shape">
          <h2>Persistent storage</h2>
          <p>Turn on storage and your platform keeps documents, labels, and tasks
            in a database. Invite colleagues; work survives between visits.</p>
        </div>
        <div class="shape">
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
              <p>Connect compatible blocks in a pipeline, or add persistent
                storage for a shared application. The app checks that the modules
                fit, so you can’t build something that won’t run.</p>
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
  /* One container for the whole page: the header, every section, the foot. */
  --container: 1120px;
  --gutter: var(--space-xl, 32px);
  --section-gap: clamp(72px, 9vw, 128px);
  --text-section: clamp(28px, 3.2vw, 44px);
  --text-title: 22px;
  min-height: 100vh;
  background: var(--ground);
  color: var(--ink);
  font-family: var(--font-body);
}

.landing-header {
  border-bottom: 1px solid var(--rule);
  background: var(--surface);
}

/* The header runs full width, as on Docs, Projects and the composer. */
.landing-main {
  box-sizing: content-box;
  max-width: var(--container);
  margin-inline: auto;
  padding-inline: var(--gutter);
}

.bar {
  padding-inline: var(--gutter);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md, 16px);
  padding-block: var(--space-md, 16px);
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
  display: flex;
  flex-direction: column;
}

/* The hero is the first screen and only the first screen: copy on the left,
   the composer itself on the right, bleeding past the container edge. */
.hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: center;
  gap: var(--space-2xl, 48px);
  min-height: clamp(560px, calc(100svh - 69px), 820px);
  padding-block: var(--space-2xl, 48px);
}

.hero-copy {
  min-width: 0;
}

.hero h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(36px, 4.2vw, 56px);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.04;
  color: var(--ink);
  text-wrap: balance;
  overflow-wrap: break-word;
  min-width: 0;
}

.lede {
  margin: var(--space-lg, 24px) 0 0;
  font-size: 18px;
  color: var(--muted);
  max-width: 44ch;
  line-height: 1.55;
  text-wrap: pretty;
}

.cta-row {
  margin-top: var(--space-xl, 32px);
}

.product {
  margin: 0 calc(var(--gutter) * -1) 0 0;
  min-width: 0;
}

.product img {
  display: block;
  width: 100%;
  height: auto;
  border: 1px solid var(--rule);
  border-radius: var(--radius-md, 12px);
  background: var(--ground);
}

button.primary {
  background: var(--accent-live-fill);
  border: 1px solid var(--accent-live-fill);
  color: var(--on-accent);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 18px;
  padding: 12px 28px;
  border-radius: var(--radius-sm, 8px);
  cursor: pointer;
  box-shadow: 0 2px 8px var(--shadow-live);
  transition: background-color 120ms ease-out, transform 120ms ease-out;
}

button.primary:hover {
  background: var(--accent-live-fill-hover);
  border-color: var(--accent-live-fill-hover);
}

button.primary:active {
  transform: translateY(1px);
}

button.primary:disabled {
  background: var(--disabled-fill);
  border-color: var(--disabled-fill);
  color: var(--disabled-ink);
  box-shadow: none;
  cursor: not-allowed;
}

button.primary:focus-visible,
.nav-link:focus-visible,
.github-link:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

/* What it makes: three rows, each a title and what it means. */
.shapes {
  display: grid;
  grid-template-columns: 1fr;
  border-top: 1px solid var(--rule);
  margin-top: var(--space-lg, 24px);
}

.shape {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  align-items: baseline;
  gap: var(--space-2xl, 48px);
  padding-block: var(--space-xl, 32px);
  border-bottom: 1px solid var(--rule);
}

.shape h2 {
  font-family: var(--font-display);
  font-size: clamp(24px, 2.4vw, 32px);
  font-weight: 700;
  letter-spacing: -0.01em;
  margin: 0;
  color: var(--ink);
  text-wrap: balance;
}

.shape p {
  margin: 0;
  color: var(--muted);
  font-size: 17px;
  line-height: 1.6;
  max-width: 52ch;
  text-wrap: pretty;
}

.how {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: var(--space-2xl, 48px);
  padding-block: var(--section-gap);
}

.how h2 {
  font-family: var(--font-display);
  font-size: var(--text-section);
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
  margin: 0;
  color: var(--ink);
  text-wrap: balance;
}

.steps-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-xl, 32px);
}

.steps-list li {
  display: flex;
  align-items: flex-start;
  gap: var(--space-lg, 24px);
}

.step-num {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border: 1px solid var(--accent-live-fill);
  border-radius: var(--radius-full, 9999px);
  background: var(--accent-live-fill);
  color: var(--on-accent);
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.steps-list strong {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: var(--text-title);
  line-height: 1.25;
  color: var(--ink);
}

.steps-list p {
  color: var(--muted);
  font-size: 17px;
  line-height: 1.6;
  margin: var(--space-xs, 4px) 0 0;
  max-width: 52ch;
  text-wrap: pretty;
}

.foot {
  border-top: 1px solid var(--rule);
  padding-block: var(--space-xl, 32px) var(--space-2xl, 48px);
}

.foot p {
  margin: 0;
}

.muted {
  color: var(--muted);
}

.small {
  font-size: 0.875rem;
  margin-top: var(--space-md, 16px);
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
  padding: 8px 12px;
  border-radius: var(--radius-sm, 8px);
  box-shadow: none;
}

.nav-link:hover {
  background: transparent;
  color: var(--accent-interactive);
}

.github-link {
  display: inline-flex;
  align-items: center;
  color: var(--ink);
  padding: 8px;
  border-radius: var(--radius-sm, 8px);
}

.github-link:hover {
  color: var(--accent-interactive);
}

@media (prefers-reduced-motion: reduce) {
  button.primary:active { transform: none; }
}

/* Below 960px the composer drops under the copy, at full width. */
@media (max-width: 960px) {
  .hero {
    grid-template-columns: minmax(0, 1fr);
    min-height: 0;
    gap: var(--space-xl, 32px);
  }

  .product {
    margin-right: 0;
  }

  .shape,
  .how {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-md, 16px);
  }
}

@media (max-width: 600px) {
  .landing {
    --gutter: var(--space-md, 16px);
  }

  .brand {
    font-size: 18px;
  }

  .hero h1 br {
    display: none;
  }

  /* The br is hidden here, so the second sentence needs its own spacing
     not to read as "platform.No code required." */
  .hero h1 .h1-line2 {
    margin-left: 0.3em;
  }
}
</style>
