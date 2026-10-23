<script setup lang="ts">
// Who is signed in. Clicking it opens what they can do about that.

import { ref } from "vue";
import { changePassword, signOut, type Account } from "../auth";

defineProps<{ account: Account }>();
const emit = defineEmits<{ "signed-out": [] }>();

const open = ref(false);

async function newPassword() {
  open.value = false;
  const password = prompt("New password (at least 8 characters)");
  if (!password) return;
  try {
    await changePassword(password);
    alert("Password changed.");
  } catch (e) {
    alert(e instanceof Error ? e.message : String(e));
  }
}

async function leave() {
  await signOut();
  emit("signed-out");
}
</script>

<template>
  <div class="account">
    <button class="who" :aria-expanded="open" @click="open = !open">
      {{ account.email }} ▾
    </button>
    <!-- Catches the click anywhere else that should close the menu. -->
    <div v-if="open" class="backdrop" @click="open = false"></div>
    <div v-if="open" class="menu">
      <button @click="newPassword">Change password</button>
      <button @click="leave">Sign out</button>
    </div>
  </div>
</template>

<style scoped>
.account {
  position: relative;
  margin-left: auto;
}

.lb-ui .who {
  border-color: transparent;
  background: transparent;
}

.backdrop {
  position: fixed;
  inset: 0;
  z-index: 9;
}

.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 0.25rem);
  display: flex;
  flex-direction: column;
  min-width: 11rem;
  padding: 0.25rem;
  border: 1px solid var(--rule);
  border-radius: var(--radius-sm, 2px);
  background: var(--surface);
  box-shadow: 0 4px 12px rgb(0 0 0 / 0.08);
  z-index: 10;
}

.lb-ui .menu button {
  border: 0;
  text-align: left;
}
</style>
