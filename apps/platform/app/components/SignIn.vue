<script setup lang="ts">
// Signing in, or creating an account — which anybody may. On a platform with
// no accounts yet, the first one created owns it.

import { ref } from "vue";
import { register, signIn } from "../auth";

const props = defineProps<{ setup: boolean }>();
const emit = defineEmits<{ "signed-in": [] }>();

const creating = ref(props.setup);
const email = ref("");
const password = ref("");
const problem = ref("");

async function submit() {
  problem.value = "";
  try {
    await (creating.value ? register : signIn)(email.value, password.value);
    emit("signed-in");
  } catch (e) {
    problem.value = e instanceof Error ? e.message : String(e);
  }
}

function toggle() {
  creating.value = !creating.value;
  problem.value = "";
}
</script>

<template>
  <form class="lb-ui sign-in" @submit.prevent="submit">
    <h1>{{ creating ? "Create an account" : "Sign in" }}</h1>
    <p v-if="setup" class="muted">
      Nobody has an account here yet. Whoever creates the first one owns this platform.
    </p>
    <label>
      Email
      <input v-model="email" type="email" autocomplete="username" required />
    </label>
    <label>
      Password
      <input
        v-model="password"
        type="password"
        :autocomplete="creating ? 'new-password' : 'current-password'"
        :minlength="creating ? 8 : undefined"
        required
      />
    </label>
    <p v-if="problem" class="error">{{ problem }}</p>
    <button class="primary" type="submit">{{ creating ? "Create account" : "Sign in" }}</button>
    <p v-if="!setup" class="muted">
      {{ creating ? "Already have an account?" : "No account yet?" }}
      <button type="button" class="link" @click="toggle">
        {{ creating ? "Sign in" : "Create one" }}
      </button>
    </p>
  </form>
</template>

<style scoped>
.sign-in {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-width: 22rem;
  margin: 15vh auto 0;
  padding: 0 1rem;
}

h1 {
  font-size: 1.3rem;
  margin: 0;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.lb-ui .link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--accent);
  text-decoration: underline;
}
</style>
