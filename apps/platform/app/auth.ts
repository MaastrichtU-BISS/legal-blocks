// Signing in and creating accounts. The server side is server/api/auth.

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

export function register(email: string, password: string): Promise<Account> {
  return post("/api/auth/register", { email, password }, "creating the account");
}

export async function signOut(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}

export async function changePassword(password: string): Promise<void> {
  const res = await fetch("/api/account/password", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!res.ok) await json(res, "changing the password");
}
