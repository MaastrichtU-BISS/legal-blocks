// Talking to the platform's own API.
//
// Everything a module reads or writes goes through here and lands in the
// platform's database. Modules own no storage and no network logic of their
// own, which is what lets the same package run against this host, against
// Supabase, or against a fixture.

export async function json<T>(res: Response, what: string): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = ((await res.json()) as { error?: string }).error ?? detail;
    } catch {
      // Non-JSON error body; the status text will do.
    }
    throw new Error(`${what}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export async function post<T>(path: string, body: unknown, what: string): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return json<T>(res, what);
}
