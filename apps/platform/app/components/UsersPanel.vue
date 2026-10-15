<script setup lang="ts">
// Everyone in the platform, for an admin: their roles, giving somebody a
// password so they can sign in, and adding somebody new. Annotators named on a
// task appear here without a password until an admin gives them one.

import { ref } from "vue";
import { addAccount, getAccounts, updateAccount, type Account } from "../auth";

defineProps<{ me: number }>();
const emit = defineEmits<{ close: [] }>();

const ROLES = ["annotator", "editor", "admin"];
const people = ref<Account[]>([]);
const problem = ref("");
const email = ref("");
const role = ref("annotator");
const password = ref("");

async function attempt(action: () => Promise<unknown>) {
  problem.value = "";
  try {
    await action();
    people.value = await getAccounts();
  } catch (e) {
    problem.value = e instanceof Error ? e.message : String(e);
  }
}

function setRole(person: Account, next: string) {
  void attempt(() => updateAccount(person.id, { role: next }));
}

function setPassword(person: Account) {
  const next = prompt(`New password for ${person.email} (at least 8 characters)`);
  if (next) void attempt(() => updateAccount(person.id, { password: next }));
}

function add() {
  void attempt(async () => {
    await addAccount(email.value, role.value, password.value);
    email.value = "";
    password.value = "";
  });
}

void attempt(async () => {});
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <section class="lb-ui panel">
      <header>
        <h2>People</h2>
        <button @click="emit('close')">Close</button>
      </header>

      <table>
        <tr v-for="p in people" :key="p.id">
          <td>{{ p.email }}</td>
          <td>
            <select
              :value="p.role"
              :disabled="p.id === me"
              @change="setRole(p, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
            </select>
          </td>
          <td class="muted">{{ p.can_sign_in ? "can sign in" : "no password yet" }}</td>
          <td><button @click="setPassword(p)">Set password</button></td>
        </tr>
      </table>

      <form class="add" @submit.prevent="add">
        <input v-model="email" type="email" placeholder="email" required />
        <select v-model="role">
          <option v-for="r in ROLES" :key="r" :value="r">{{ r }}</option>
        </select>
        <input v-model="password" type="text" placeholder="password" minlength="8" required />
        <button type="submit">Add</button>
      </form>

      <p v-if="problem" class="error">{{ problem }}</p>
    </section>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgb(0 0 0 / 0.3);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 10vh 1rem;
  z-index: 10;
}

.panel {
  background: #fff;
  border-radius: 6px;
  padding: 1rem;
  width: min(44rem, 100%);
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

h2 {
  margin: 0;
  font-size: 1.1rem;
}

table {
  width: 100%;
  margin: 1rem 0;
  border-collapse: collapse;
}

td {
  padding: 0.3rem 0.4rem;
  border-bottom: 1px solid var(--border);
}

.add {
  display: flex;
  gap: 0.4rem;
}
</style>
