// Theme preference: "light" | "dark" | "system". Persisted in localStorage.
// Effective theme resolves "system" via prefers-color-scheme.

import { ref, computed, onMounted, onBeforeUnmount } from "vue";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "legal-blocks:theme";
const preference = ref<ThemePreference>("system");
let mediaQuery: MediaQueryList | null = null;
let initialized = false;

function readStored(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
}

function resolveEffective(pref: ThemePreference): "light" | "dark" {
  if (pref === "light") return "light";
  if (pref === "dark") return "dark";
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(pref: ThemePreference) {
  if (typeof document === "undefined") return;
  const effective = resolveEffective(pref);
  const root = document.documentElement;
  root.classList.toggle("dark", effective === "dark");
  root.setAttribute("data-theme", effective);
  root.style.colorScheme = effective;
}

export function useTheme() {
  const effective = computed(() => resolveEffective(preference.value));

  function set(next: ThemePreference) {
    preference.value = next;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
    apply(next);
  }

  function cycle() {
    const order: ThemePreference[] = ["light", "dark", "system"];
    const idx = order.indexOf(preference.value);
    set(order[(idx + 1) % order.length]!);
  }

  function handleMediaChange() {
    if (preference.value === "system") apply(preference.value);
  }

  function init() {
    if (initialized) return;
    initialized = true;
    preference.value = readStored();
    apply(preference.value);
    if (typeof window !== "undefined") {
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", handleMediaChange);
    }
  }

  onMounted(() => {
    // Ensure applied after hydration.
    init();
  });

  onBeforeUnmount(() => {
    // Keep listener for app lifetime; do not remove.
  });

  return { preference, effective, set, cycle, init };
}
