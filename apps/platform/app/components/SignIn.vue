<script setup lang="ts">
// The sign-in form, or — on a platform nobody can sign in to yet — the form
// that makes its first admin.

import { ref } from "vue";
import { setUp, signIn } from "../auth";

const props = defineProps<{ setup: boolean }>();
const emit = defineEmits<{ "signed-in": [] }>();

const email = ref("");
const password = ref("");
const problem = ref("");

async function submit() {
  problem.value = "";
  try {
    await (props.setup ? setUp : signIn)(email.value, password.value);
    emit("signed-in");
  } catch (e) {
    problem.value = e instanceof Error ? e.message : String(e);
  }
}
</script>

<template>
  <form class="lb-ui sign-in" @submit.prevent="submit">
    <h1>{{ setup ? "Create the admin account" : "Sign in" }}</h1>
    <p v-if="setup" class="muted">
      Nobody can sign in to this platform yet. Whoever fills this in becomes its admin.
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
        :autocomplete="setup ? 'new-password' : 'current-password'"
        :minlength="setup ? 8 : undefined"
        required
      />
    </label>
    <p v-if="problem" class="error">{{ problem }}</p>
    <button class="primary" type="submit">{{ setup ? "Create and sign in" : "Sign in" }}</button>
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
</style>
