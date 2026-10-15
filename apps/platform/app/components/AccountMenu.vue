<script setup lang="ts">
// Who is signed in, a way out, and — for an admin — the people list.

import { ref } from "vue";
import { signOut, updateAccount, type Account } from "../auth";
import UsersPanel from "./UsersPanel.vue";

const props = defineProps<{ account: Account }>();
const emit = defineEmits<{ "signed-out": [] }>();

const showUsers = ref(false);

async function changePassword() {
  const password = prompt("New password (at least 8 characters)");
  if (!password) return;
  try {
    await updateAccount(props.account.id, { password });
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
    <span class="muted">{{ account.email }} · {{ account.role }}</span>
    <button v-if="account.role === 'admin'" @click="showUsers = true">People</button>
    <button @click="changePassword">Change password</button>
    <button @click="leave">Sign out</button>
  </div>
  <UsersPanel v-if="showUsers" :me="account.id" @close="showUsers = false" />
</template>

<style scoped>
.account {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
}
</style>
