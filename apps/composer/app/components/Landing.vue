<script lang="ts">
let assemblyPlayedThisPage = false;
</script>

<script setup lang="ts">
// The front door. Explains what Legal Blocks is in plain language, then
// hands off to the composer. Keeping this separate from Composer.vue means the
// composer stays a tool and this stays a page.

import { animate } from "motion";
import { onBeforeUnmount, onMounted, ref } from "vue";
import ThemeToggle from "@base/components/ThemeToggle.vue";
import SquareLockMark from "./SquareLockMark.vue";

const emit = defineEmits<{ start: []; docs: [] }>();
const assemblyRoot = ref<HTMLElement | null>(null);
const assemblyAlreadyPlayed = assemblyPlayedThisPage;
let stopAssemblyAnimations: (() => void) | undefined;

function playAssemblyOnFreshLoad() {
  if (assemblyPlayedThisPage) return;
  assemblyPlayedThisPage = true;

  const root = assemblyRoot.value;
  if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  stopAssemblyAnimations?.();
  const search = root.querySelector<HTMLElement>(".piece-search");
  const annotate = root.querySelector<HTMLElement>(".piece-annotate");
  const agreement = root.querySelector<HTMLElement>(".piece-agreement");
  if (!search || !annotate || !agreement) return;

  const sequence = [
    [search, { y: [-360, 0], opacity: [0, 1] }, { duration: 2.7, ease: "easeInOut" }],
    [annotate, { y: [-360, 0], opacity: [0, 1] }, { duration: 2.7, ease: "easeInOut", at: 1.35 }],
    [agreement, { y: [-360, 0], opacity: [0, 1] }, { duration: 2.7, ease: "easeInOut", at: 2.7 }],
  ] as const;

  const animation = animate(sequence);

  stopAssemblyAnimations = () => animation.stop();
}

onMounted(playAssemblyOnFreshLoad);
onBeforeUnmount(() => stopAssemblyAnimations?.());
</script>

<template>
  <div class="landing lb-ui">
    <header class="landing-header">
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
    </header>

    <main class="landing-main">
      <section class="hero">
        <div
          ref="assemblyRoot"
          :class="['assembly-background', { 'assembly-static': assemblyAlreadyPlayed }]"
          aria-hidden="true"
        >
          <div class="assembly-board">
            <div class="assembly-piece piece-search" data-assembly-piece>
              <div class="piece-grid">
                <span class="tile"></span><span class="tile"></span>
                <span class="tile tile-empty"></span><span class="tile"></span>
                <span class="tile tile-empty"></span><span class="tile"></span>
              </div>
              <span class="piece-label">Search</span>
            </div>
            <div class="assembly-piece piece-annotate" data-assembly-piece>
              <div class="piece-grid">
                <span class="tile"></span><span class="tile"></span>
                <span class="tile"></span><span class="tile tile-empty"></span>
                <span class="tile"></span><span class="tile tile-empty"></span>
              </div>
              <span class="piece-label">Annotate</span>
            </div>
            <div class="assembly-piece piece-agreement" data-assembly-piece>
              <div class="piece-grid piece-grid-square">
                <span class="tile"></span><span class="tile"></span>
                <span class="tile"></span><span class="tile"></span>
              </div>
              <span class="piece-label">Agreement</span>
            </div>
          </div>
        </div>

        <div class="hero-copy">
          <div class="hero-brand">
            <SquareLockMark :size="40" />
            <span class="hero-brand-name">Legal Blocks</span>
          </div>
          <h1>Build your own research platform.<br /><span class="h1-line2">No code required.</span></h1>
          <p class="lede">
            Pick the tools you need, snap them together like building blocks, and
            share a working app with your team. Takes minutes, not months.
          </p>
          <div class="cta-row">
            <button class="primary" @click="emit('start')">Start building →</button>
          </div>
          <p class="muted small">Free and open source. Runs on your computer.</p>
        </div>
        <div class="assembly-status">
          <span class="pulse-dot"></span>
          <span>Running in the background…</span>
        </div>
      </section>

      <section class="shapes">
        <div class="shape">
          <span class="shape-num">01</span>
          <h2>One-off runs</h2>
          <p>Search, explore, download. Great for a quick look at case law or
            documents. Nothing is saved — just take your results and go.</p>
        </div>
        <div class="shape">
          <span class="shape-num">02</span>
          <h2>Persistent storage</h2>
          <p>Turn on storage and your platform keeps documents, labels, and tasks
            in a database. Invite colleagues; work survives between visits.</p>
        </div>
        <div class="shape">
          <span class="shape-num">03</span>
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
                fit — you can't build something that won't run.</p>
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
  gap: 0;
}

.hero {
  position: relative;
  isolation: isolate;
  min-height: 420px;
  overflow: hidden;
  padding: 0 0 var(--space-2xl, 48px);
}

.hero-copy {
  position: relative;
  z-index: 1;
  max-width: min(60%, 620px);
  min-width: 0;
}

.hero h1 {
  margin: 0;
  font-family: var(--font-display);
  font-size: clamp(36px, 6vw, 56px);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.05;
  max-width: 16ch;
  color: var(--ink);
}

.lede {
  margin: var(--space-md, 16px) 0 0;
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
  grid-template-columns: 1fr;
  border-top: 1px solid var(--rule);
}

.shape {
  display: grid;
  grid-template-columns: 48px minmax(210px, 260px) minmax(0, 1fr);
  align-items: start;
  gap: var(--space-md, 16px);
  padding: 20px 4px;
  border-bottom: 1px solid var(--rule);
}

.shape-num {
  padding-top: 4px;
  color: var(--accent-interactive);
  font-family: var(--font-mono);
  font-size: 12px;
  letter-spacing: 0.08em;
}

.shape h2 {
  font-family: var(--font-display);
  font-size: 20px;
  font-weight: 800;
  margin: 0;
  color: var(--ink);
}

.shape p {
  margin: 1px 0 0;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.5;
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
  border-top: 1px solid var(--rule);
  padding: var(--space-lg, 24px) 4px 0;
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

/* Oversized, translucent tetrominoes run behind the hero copy. */
.assembly-background {
  position: absolute;
  z-index: 0;
  inset: 0 -24px 0 auto;
  display: grid;
  width: 62%;
  place-items: center;
  overflow: hidden;
  pointer-events: none;
}

.assembly-board {
  --assembly-tile: 68px;
  position: relative;
  width: calc(var(--assembly-tile) * 4);
  height: calc(var(--assembly-tile) * 3);
}

.assembly-piece {
  position: absolute;
  top: 0;
  left: 0;
  opacity: 0;
  will-change: transform;
}

.assembly-static .assembly-piece {
  opacity: 1;
  transform: translateY(0);
}

.piece-annotate {
  left: calc(var(--assembly-tile) * 2);
  --piece-color: #0b746b;
}

.piece-search {
  --piece-color: #b5473f;
}

.piece-agreement {
  top: 0;
  left: var(--assembly-tile);
  --piece-color: #315a53;
}

.piece-grid {
  display: grid;
  grid-template-columns: repeat(2, var(--assembly-tile));
  grid-template-rows: repeat(3, var(--assembly-tile));
}

.piece-search .piece-grid,
.piece-annotate .piece-grid {
  transform: rotate(180deg);
}

.piece-grid-square {
  grid-template-rows: repeat(2, var(--assembly-tile));
}

.tile {
  display: block;
  background: var(--piece-color);
  border: 1px solid rgb(255 255 255 / 22%);
}

.tile-empty {
  visibility: hidden;
}

.piece-label {
  position: absolute;
  z-index: 1;
  top: 0;
  left: 0;
  display: grid;
  width: calc(var(--assembly-tile) * 2);
  height: var(--assembly-tile);
  place-items: center;
  color: #fff;
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
}

.piece-search .piece-label,
.piece-annotate .piece-label {
  top: auto;
  bottom: 0;
}

.piece-agreement .piece-label {
  height: calc(var(--assembly-tile) * 2);
}

.assembly-status {
  position: absolute;
  z-index: 1;
  right: 0;
  bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--space-sm, 8px);
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
  animation: pulse 3.5s ease-in-out infinite;
}
@keyframes pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.8); } }

.how {
  display: grid;
  grid-template-columns: minmax(180px, 0.7fr) minmax(0, 1.3fr);
  gap: var(--space-xl, 32px);
  padding: var(--space-2xl, 48px) 4px;
}

@media (prefers-reduced-motion: reduce) {
  .assembly-piece { opacity: 1; }
  .pulse-dot { animation: none; }
}

@media (max-width: 820px) {
  .hero {
    min-height: 500px;
  }

  .hero-copy {
    max-width: 100%;
  }

  .assembly-background {
    top: 90px;
    right: -10%;
    bottom: 0;
    width: 78%;
  }

  .assembly-board {
    --assembly-tile: 58px;
  }
}

@media (max-width: 600px) {
  .landing-header {
    padding-inline: var(--space-md, 16px);
  }

  .brand {
    font-size: 18px;
  }

  .landing-main {
    padding: var(--space-xl, 32px) var(--space-md, 16px);
  }

  .hero h1 br {
    display: none;
  }

  /* The br is hidden here, so the second sentence needs its own spacing
     not to read as "platform.No code required." */
  .hero h1 .h1-line2 {
    margin-left: 0.3em;
  }

  .hero {
    min-height: 540px;
  }

  .hero-copy {
    padding-bottom: 30px;
  }

  .assembly-background {
    top: 150px;
    right: -18%;
    width: 100%;
  }

  .assembly-board {
    --assembly-tile: 50px;
  }

  .assembly-status {
    right: 0;
    bottom: 10px;
    font-size: 10px;
  }

  .shape {
    grid-template-columns: 32px minmax(0, 1fr);
    gap: 8px var(--space-md, 16px);
  }

  .shape p {
    grid-column: 2;
  }

  .how {
    grid-template-columns: 1fr;
    gap: var(--space-md, 16px);
  }
}

</style>
