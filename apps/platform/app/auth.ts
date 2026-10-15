// Signing in and managing who can. The server side is server/api/auth and
// server/api/users.

import { json, post } from "@base/api/http";
import type { User } from "@base/api";

export interface Account extends User {
  can_sign_in: boolean;
}

export type AuthState =
  | { login: false }
  | { login: true; needsSetup: boolean; user: Account | null };

export async function getAuthState(): Promise<AuthState> {
  return json(await fetch("/api/auth/state"), "checking who is signed in");
}

export function signIn(email: string, password: string): Promise<Account> {
  return post("/api/auth/login", { email, password }, "signing in");
}

export function setUp(email: string, password: string): Promise<Account> {
  return post("/api/auth/setup", { email, password }, "creating the admin account");
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function getAccounts(): Promise<Account[]> {
  return json(await fetch("/api/users"), "loading people");
}

export function addAccount(email: string, role: string, password: string): Promise<Account> {
  return post("/api/users", { email, role, password }, "adding the person");
}

export async function updateAccount(
  id: number,
  change: { role?: string; password?: string },
): Promise<Account> {
  const res = await fetch(`/api/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(change),
  });
  return json(res, "saving the change");
}
