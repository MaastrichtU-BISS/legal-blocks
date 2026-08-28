// What this platform is: its module catalogue and the pipeline it runs.

import type { Pipeline, Registry } from "../types";
import { json } from "./http";

export async function getRegistry(): Promise<Registry> {
  return json(await fetch("/api/registry"), "loading module registry");
}

export async function getPipeline(): Promise<Pipeline | null> {
  const res = await fetch("/api/pipeline");
  if (res.status === 404) return null;
  return json(res, "loading pipeline");
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

export async function getUsers(): Promise<User[]> {
  return json(await fetch("/api/users"), "loading users");
}
