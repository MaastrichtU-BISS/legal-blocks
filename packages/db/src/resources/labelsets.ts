// Labelsets: what an annotator is allowed to apply.
//
// They stand alone rather than being part of task creation. Folding them in
// would mean retyping the same labels for the second task, and the same
// documents can carry two tasks that label them differently — which is the case
// worth supporting, since comparing those is the point of a lot of annotation
// work.

import type { Handle } from "../db.js";
import { transaction } from "../db.js";
import type { Label } from "../model.js";

const PALETTE = [
  "#2563eb",
  "#dc2626",
  "#059669",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
] as const;


/** One row of the labelsets tab. */
export interface LabelsetSummary {
  id: number;
  name: string;
  desc: string;
  labels: Label[];
  /** Tasks using it, so deleting one can say what it would take with it. */
  task_count: number;
}

/** Every labelset, newest first. */
export function labelsets(db: Handle): LabelsetSummary[] {
  const rows = db
    .prepare(
      `SELECT l.id, l.name, l."desc", l.labels,
              (SELECT COUNT(*) FROM tasks t WHERE t.labelset_id = l.id) AS task_count
       FROM labelsets l ORDER BY l.id DESC`,
    )
    .all() as { id: number; name: string; desc: string; labels: string; task_count: number }[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    desc: r.desc,
    labels: parseJSON<Label[]>(r.labels, []),
    task_count: r.task_count,
  }));
}

/**
 * Stores a new labelset and returns its id.
 *
 * Colours are assigned here when the caller did not choose them, so every
 * labelset looks deliberate without anyone having to pick from a colour wheel
 * to get started.
 */
export function createLabelset(
  db: Handle,
  ownerId: number,
  name: string,
  desc: string,
  labels: Label[],
): number {
  const filled: Label[] = [];
  labels.forEach((l, i) => {
    const trimmed = l.name.trim();
    if (trimmed === "") return;
    filled.push({ name: trimmed, color: l.color || PALETTE[i % PALETTE.length]! });
  });
  if (filled.length === 0) {
    throw new Error("a labelset needs at least one label");
  }

  return transaction(db, () => {
    const res = db
      .prepare(`INSERT INTO labelsets (user_id, name, "desc", labels) VALUES (?, ?, ?, ?)`)
      .run(ownerId, name.trim(), desc, JSON.stringify(filled));
    return Number(res.lastInsertRowid);
  });
}

function parseJSON<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
