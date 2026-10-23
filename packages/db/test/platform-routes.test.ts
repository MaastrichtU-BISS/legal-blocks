import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Handle } from "../src/db.js";
import { open } from "../src/db.js";
import {
  annotations,
  bundle,
  createDataset,
  iaaInput,
  queue,
  saveAssignment,
  syncTask,
  taskProgress,
  usersByEmail,
} from "../src/index.js";

let db: Handle;

beforeEach(() => {
  db = open(":memory:");
});

afterEach(() => {
  db.close();
});

function seed() {
  const people = usersByEmail(db, ["anna@example.org", "bram@example.org"]);
  const datasetId = createDataset(db, people[0]!.id, "Rulings", "", [
    { name: "doc-a", full_text: "The tenant shall pay rent" },
    { name: "doc-b", full_text: "The landlord may terminate" },
  ]);
  const taskId = syncTask(db, people[0]!.id, datasetId, {
    name: "Obligations",
    guidelines: "",
    annotation_level: "word",
    labels: ["Obligation", "Right"],
    annotators: 2,
  });
  return { taskId, people };
}

describe("platform route backends (db-level)", () => {
  it("queue returns one entry per document per annotator", () => {
    const { taskId, people } = seed();
    const q = queue(db, taskId, people[0]!.id);
    expect(q).toHaveLength(2);
    expect(q.map((e) => e.name)).toEqual(["doc-a", "doc-b"]);
  });

  it("annotations (spans) are stored and readable", () => {
    const { taskId, people } = seed();
    const q = queue(db, taskId, people[0]!.id);
    const b = bundle(db, q[0]!.assignment_id);
    b.assignment.annotations = [
      { id: -1, label: "Obligation", start: 11, end: 16, text: "shall", confidence: 0, metadata: null, relations: [] },
    ];
    saveAssignment(db, q[0]!.assignment_id, b.assignment);

    const all = annotations(db, taskId);
    expect(all).toHaveLength(1);
    expect(all[0]?.label).toBe("Obligation");
    expect(all[0]?.text).toBe("shall");
  });

  it("progress reflects saved work", () => {
    const { taskId, people } = seed();
    const q = queue(db, taskId, people[0]!.id);
    const b = bundle(db, q[0]!.assignment_id);
    b.assignment.annotations = [
      { id: -1, label: "Obligation", start: 11, end: 16, text: "shall", confidence: 0, metadata: null, relations: [] },
    ];
    saveAssignment(db, q[0]!.assignment_id, b.assignment);

    const p = taskProgress(db, taskId);
    expect(p.total).toBe(4);
    expect(p.done).toBe(1);
  });

  it("iaa input carries spans", () => {
    const { taskId, people } = seed();
    for (const u of people) {
      const q = queue(db, taskId, u.id);
      const b = bundle(db, q[0]!.assignment_id);
      b.assignment.annotations = [
        { id: -1, label: "Obligation", start: 11, end: 16, text: "shall", confidence: 0, metadata: null, relations: [] },
      ];
      saveAssignment(db, q[0]!.assignment_id, b.assignment);
    }
    const input = iaaInput(db, taskId);
    expect(input.documents[0]?.assignments).toHaveLength(2);
    expect(input.documents[0]?.assignments[0]?.annotations[0]?.text).toBe("shall");
  });
});
