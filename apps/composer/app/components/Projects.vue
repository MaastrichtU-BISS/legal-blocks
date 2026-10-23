<script setup lang="ts">
// Project management: a simple hub for the platforms you are designing.
//
// Projects live in the browser for now (localStorage). Each one wraps a
// platform draft; opening one loads it into the composer. When persistent
// storage/auth lands, this becomes a server-backed list scoped to an account.

import { onMounted, ref } from "vue";

interface Project {
  id: string;
  name: string;
  kind: "pipeline" | "workspace";
  updatedAt: number;
}

const emit = defineEmits<{ open: [id: string]; back: []; compose: []; docs: [] }>();

const projects = ref<Project[]>([]);
const newName = ref("");
const editing = ref<string | null>(null);
const editName = ref("");

const STORAGE_KEY = "legal-blocks:projects";

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    projects.value = raw ? JSON.parse(raw) : [];
  } catch {
    projects.value = [];
  }
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects.value));
}

function create() {
  const name = newName.value.trim() || `Untitled ${projects.value.length + 1}`;
  const p: Project = { id: `p${Date.now()}`, name, kind: "pipeline", updatedAt: Date.now() };
  projects.value.unshift(p);
  save();
  newName.value = "";
}

function remove(id: string) {
  if (!confirm("Delete this project?")) return;
  projects.value = projects.value.filter((p) => p.id !== id);
  save();
}

function startEdit(p: Project) {
  editing.value = p.id;
  editName.value = p.name;
}

function commitEdit(id: string) {
  const p = projects.value.find((x) => x.id === id);
  if (p && editName.value.trim()) p.name = editName.value.trim();
  p && (p.updatedAt = Date.now());
  editing.value = null;
  save();
}

function exportAll() {
  const blob = new Blob([JSON.stringify(projects.value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "legal-blocks-projects.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result)) as Project[];
      projects.value = [...parsed, ...projects.value];
      save();
    } catch {
      alert("Not a valid projects file.");
    }
  };
  reader.readAsText(file);
}

onMounted(load);
</script>

<template>
  <div class="page lb-ui">
    <header class="page-header">
      <span class="brand" @click="emit('back')">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1" fill="#E85A4F" stroke="#1F2937" stroke-width="2" />
          <rect x="14" y="3" width="7" height="7" rx="1" fill="#0D9488" stroke="#1F2937" stroke-width="2" />
          <rect x="3" y="14" width="7" height="7" rx="1" fill="#10B981" stroke="#1F2937" stroke-width="2" />
          <rect x="14" y="14" width="7" height="7" rx="1" fill="#3B82F6" stroke="#1F2937" stroke-width="2" />
        </svg>
        Legal Blocks
      </span>
      <nav class="page-nav">
        <button class="nav-link" @click="emit('back')">Home</button>
        <button class="nav-link" @click="emit('docs')">Docs</button>
        <a class="github-link" href="https://github.com/MaastrichtU-BISS/legal-blocks" target="_blank" rel="noreferrer" aria-label="GitHub">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.44 9.79 8.2 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.54-1.38-1.33-1.75-1.33-1.75-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.69.83.57C20.57 21.79 24 17.31 24 12 24 5.37 18.63 0 12 0z"/></svg>
        </a>
        <button class="primary" @click="emit('compose')">New project →</button>
      </nav>
    </header>

    <main class="page-main">
      <section class="hero">
        <h1>Your projects</h1>
        <p class="lede">Create, rename, and open the platforms you are designing.
          Each project wraps a draft you can pick up where you left off.</p>
      </section>

      <section class="create-row">
        <input v-model="newName" class="name-input" placeholder="New project name…" @keyup.enter="create" />
        <button class="primary" @click="create">Create</button>
        <label class="import-btn">
          Import
          <input type="file" accept="application/json" @change="importFile" hidden />
        </label>
        <button class="ghost" @click="exportAll">Export all</button>
      </section>

      <section v-if="projects.length === 0" class="empty-state">
        <h3>No projects yet</h3>
        <p>Create your first project above, or import one from a file.</p>
      </section>

      <section v-else class="project-list">
        <div v-for="p in projects" :key="p.id" class="project-card">
          <div class="project-info">
            <template v-if="editing === p.id">
              <input v-model="editName" class="name-input" @keyup.enter="commitEdit(p.id)" @blur="commitEdit(p.id)" />
            </template>
            <template v-else>
              <strong class="project-name" @dblclick="startEdit(p)">{{ p.name }}</strong>
              <span class="project-meta">{{ p.kind === 'workspace' ? 'With database' : 'Without database' }} · {{ new Date(p.updatedAt).toLocaleDateString() }}</span>
            </template>
          </div>
          <div class="project-actions">
            <button class="ghost" @click="startEdit(p)">Rename</button>
            <button class="ghost danger" @click="remove(p.id)">Delete</button>
            <button class="primary" @click="emit('open', p.id)">Open →</button>
          </div>
        </div>
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
  border-bottom: 1px solid var(--rule);
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
  border-radius: var(--radius-sm, 8px);
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
.create-row {
  display: flex;
  gap: var(--space-sm, 8px);
  align-items: center;
  flex-wrap: wrap;
}
.name-input {
  flex: 1;
  min-width: 200px;
  padding: 10px 12px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm, 8px);
  font-family: var(--font-body);
  font-size: 14px;
  background: var(--surface);
  color: var(--ink);
}
.import-btn {
  display: inline-flex;
  align-items: center;
  padding: 10px 16px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm, 8px);
  background: var(--surface);
  color: var(--ink);
  font-weight: 600;
  cursor: pointer;
  font-size: 14px;
}
.ghost {
  background: transparent;
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm, 8px);
  padding: 10px 16px;
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  color: var(--ink);
}
.ghost.danger {
  color: var(--danger);
  border-color: var(--danger);
}
.ghost.danger:hover {
  background: var(--danger);
  color: #fff;
}
.project-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-md, 16px);
}
.project-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md, 16px);
  padding: var(--space-md, 16px);
  border: 1px solid var(--rule);
  border-radius: var(--radius-md, 12px);
  background: var(--surface);
  flex-wrap: wrap;
}
.project-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
  min-width: 200px;
}
.project-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 16px;
  color: var(--ink);
}
.project-meta {
  font-size: 12px;
  color: var(--muted);
  font-family: var(--font-mono);
}
.project-actions {
  display: flex;
  gap: var(--space-sm, 8px);
  align-items: center;
}
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm, 8px);
  padding: var(--space-2xl, 48px);
  text-align: center;
  color: var(--muted);
  border: 1px dashed var(--rule);
  border-radius: var(--radius-md, 12px);
}
.empty-state h3 {
  font-family: var(--font-display);
  font-size: 18px;
  font-weight: 700;
  color: var(--ink);
}
.empty-state p {
  font-size: 14px;
  line-height: 1.5;
}
.muted { color: var(--muted); }
.small { font-size: 0.9em; }
button.primary {
  background: var(--accent-live);
  border: 1px solid var(--accent-live);
  color: #fff;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 14px;
  padding: 10px 20px;
  border-radius: var(--radius-sm, 8px);
  cursor: pointer;
  box-shadow: 0 2px 8px rgb(232 90 79 / 0.25);
}
button.primary:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgb(232 90 79 / 0.3); }
code { font-family: var(--font-mono); }
</style>