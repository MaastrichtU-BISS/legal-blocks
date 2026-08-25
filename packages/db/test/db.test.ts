import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Handle } from "../src/index.js";
import {
  addDocuments,
  annotations,
  bundle,
  createDataset,
  iaaInput,
  incomingRelations,
  open,
  queue,
  saveAssignment,
  syncTask,
  users,
  usersByEmail,
} from "../src/index.js";

let dir: string;
let db: Handle;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "legal-blocks-db-"));
  db = open(join(dir, "test.db"));
});
afterEach(() => {
  db.close();
  rmSync(dir, { recursive: true, force: true });
});

/**
 * The flagship pipeline's state: a dataset, a task, two annotators assigned
 * every document.
 */
function seed(): { taskId: number; datasetId: number; people: ReturnType<typeof usersByEmail> } {
  const people = usersByEmail(db, ["anna@example.org", "bram@example.org"]);
  expect(people).toHaveLength(2);

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
  return { taskId, datasetId, people };
}

describe("opening the database", () => {
  it("applies the schema and survives reopening", () => {
    const path = join(dir, "reopen.db");
    const first = open(path);
    usersByEmail(first, ["anna@example.org"]);
    first.close();

    // Reopening must not wipe or fail on the existing schema.
    const second = open(path);
    expect(users(second)).toHaveLength(1);
    second.close();
  });

  // The schema is duplicated while the Go implementation still exists beside
  // this one. Byte equality is the only thing keeping them from drifting, and
  // this test goes away when internal/db does.
  it("uses a schema identical to the Go implementation's", () => {
    const ts = fileURLToPath(new URL("../src/schema.sql", import.meta.url));
    const go = fileURLToPath(new URL("../../../internal/db/schema.sql", import.meta.url));
    expect(readFileSync(ts, "utf8")).toBe(readFileSync(go, "utf8"));
  });
});

describe("users", () => {
  // Anna typing her own address in one case and her colleague typing it in
  // another must not produce two annotators with half the work each.
  it("matches addresses case-insensitively and stores them lowercased", () => {
    const first = usersByEmail(db, ["Anna@Example.org"]);
    const again = usersByEmail(db, ["anna@EXAMPLE.ORG"]);
    expect(first[0]?.id).toBe(again[0]?.id);
    expect(first[0]?.email).toBe("anna@example.org");
    expect(users(db)).toHaveLength(1);
  });

  it("names an unknown address after its local part", () => {
    expect(usersByEmail(db, ["bram@example.org"])[0]?.name).toBe("bram");
  });

  it("returns people in the order asked for, ignoring blanks and repeats", () => {
    const got = usersByEmail(db, ["b@x.org", "", "a@x.org", "b@x.org", "   "]);
    expect(got.map((u) => u.email)).toEqual(["b@x.org", "a@x.org"]);
  });
});

describe("saving an assignment", () => {
  it("stores spans, nests their relations, and keeps document tags", () => {
    const { taskId, people } = seed();
    const q = queue(db, taskId, people[0]!.id);
    expect(q).toHaveLength(2);

    const b = bundle(db, q[0]!.assignment_id);
    // Client-side ids; the store assigns its own and rewrites the relation.
    b.assignment.annotations = [
      { id: -1, label: "Obligation", start: 11, end: 16, text: "shall", confidence: 0, metadata: null, relations: [{ to: -2, direction: "right", labels: ["Part of"] }] },
      { id: -2, label: "Right", start: 4, end: 10, text: "tenant", confidence: 0, metadata: null, relations: [] },
    ];
    b.assignment.document_annotations = [{ id: -1, label: "Obligation", confidence: 5 }];
    b.assignment.document_relations = [{ to: "doc-b", labels: ["Cites"] }];
    saveAssignment(db, q[0]!.assignment_id, b.assignment);

    const got = bundle(db, q[0]!.assignment_id);
    const withRelation = got.assignment.annotations.find((s) => s.relations.length > 0);
    expect(withRelation, "no span came back carrying a relation").toBeDefined();
    expect(withRelation!.relations[0]?.direction).toBe("right");
    expect(withRelation!.relations[0]?.labels).toEqual(["Part of"]);

    // The relation must point at the other span's *new* stored id.
    const target = got.assignment.annotations.find((s) => s.id === withRelation!.relations[0]!.to);
    expect(target?.label).toBe("Right");

    expect(got.assignment.document_annotations).toHaveLength(1);
    expect(got.assignment.document_relations[0]?.to).toBe("doc-b");

    // The reverse view is computed, never stored.
    const incoming = incomingRelations(db, q[1]!.assignment_id);
    expect(incoming).toHaveLength(1);
    expect(incoming[0]?.to).toBe("doc-a");
  });

  it("replaces only its own annotations and leaves the other annotator alone", () => {
    const { taskId, people } = seed();
    const mine = queue(db, taskId, people[0]!.id)[0]!;
    const theirs = queue(db, taskId, people[1]!.id)[0]!;

    for (const id of [mine.assignment_id, theirs.assignment_id]) {
      const b = bundle(db, id);
      b.assignment.annotations = [
        { id: -1, label: "Obligation", start: 11, end: 16, text: "shall", confidence: 0, metadata: null, relations: [] },
      ];
      saveAssignment(db, id, b.assignment);
    }

    const b = bundle(db, mine.assignment_id);
    b.assignment.annotations = [];
    saveAssignment(db, mine.assignment_id, b.assignment);

    expect(bundle(db, mine.assignment_id).assignment.annotations).toHaveLength(0);
    expect(bundle(db, theirs.assignment_id).assignment.annotations).toHaveLength(1);
  });
});

describe("the annotation list", () => {
  function annotateBoth(taskId: number, people: ReturnType<typeof usersByEmail>) {
    for (const u of people) {
      const q = queue(db, taskId, u.id);
      const b = bundle(db, q[0]!.assignment_id);
      b.assignment.confidence = 3;
      b.assignment.annotations = [
        { id: -1, label: "Obligation", start: 11, end: 16, text: "shall", confidence: 0, metadata: null, relations: [] },
      ];
      saveAssignment(db, q[0]!.assignment_id, b.assignment);
    }
  }

  it("filters in SQL rather than in the browser", () => {
    const { taskId, people } = seed();
    annotateBoth(taskId, people);

    const all = annotations(db, taskId);
    expect(all).toHaveLength(2);

    expect(
      annotations(db, taskId, { labels: ["Obligation"], annotators: [all[0]!.annotator] }),
    ).toHaveLength(1);
    expect(annotations(db, taskId, { labels: ["Right"] })).toHaveLength(0);
  });

  // A whole-document label is an annotation like any other and has to appear
  // in the browsable list. It has no offsets, so it arrives with none.
  it("includes whole-document labels as zero-extent rows", () => {
    const { datasetId, people } = seed();
    const taskId = syncTask(db, people[0]!.id, datasetId, {
      name: "Topic",
      guidelines: "",
      annotation_level: "document",
      labels: ["Obligation", "Right"],
      annotators: 2,
    });

    for (const u of people) {
      const q = queue(db, taskId, u.id);
      const b = bundle(db, q[0]!.assignment_id);
      b.assignment.document_annotations = [{ id: -1, label: "Obligation", confidence: 4 }];
      saveAssignment(db, q[0]!.assignment_id, b.assignment);
    }

    const all = annotations(db, taskId);
    expect(all, "document labels are missing, so the viewer shows nothing").toHaveLength(2);
    expect(all[0]!.label).toBe("Obligation");
    expect(all[0]!.confidence).toBe(4);
    expect([all[0]!.start, all[0]!.end, all[0]!.text]).toEqual([0, 0, ""]);

    // The same filters have to reach them.
    expect(
      annotations(db, taskId, {
        labels: ["Obligation"],
        documents: ["doc-a"],
        annotators: [all[0]!.annotator],
      }),
    ).toHaveLength(1);
  });
});

describe("the IAA input", () => {
  it("carries each annotator's spans and their difficulty rating", () => {
    const { taskId, people } = seed();
    for (const u of people) {
      const q = queue(db, taskId, u.id);
      const b = bundle(db, q[0]!.assignment_id);
      b.assignment.confidence = 3;
      b.assignment.annotations = [
        { id: -1, label: "Obligation", start: 11, end: 16, text: "shall", confidence: 0, metadata: null, relations: [] },
      ];
      saveAssignment(db, q[0]!.assignment_id, b.assignment);
    }

    const input = iaaInput(db, taskId);
    expect(input.documents).toHaveLength(2);
    const docA = input.documents[0]!;
    expect(docA.name).toBe("doc-a");
    expect(docA.assignments).toHaveLength(2);
    for (const a of docA.assignments) {
      expect(a.difficulty_rating).toBe(3);
      expect(a.annotations[0]?.text).toBe("shall");
    }
    // Omitted for a span task; the service infers span comparison from it.
    expect(input.annotation_level).toBeUndefined();
  });
});

// Re-importing a folder must not destroy annotations on files already there.
describe("adding documents to a dataset", () => {
  it("keeps existing documents' ids so their annotations survive", () => {
    const { taskId, datasetId, people } = seed();
    const q = queue(db, taskId, people[0]!.id);
    const b = bundle(db, q[0]!.assignment_id);
    b.assignment.annotations = [
      { id: -1, label: "Obligation", start: 11, end: 16, text: "shall", confidence: 0, metadata: null, relations: [] },
    ];
    saveAssignment(db, q[0]!.assignment_id, b.assignment);

    addDocuments(db, datasetId, [
      // Same name, corrected text — the case that makes this an update rather
      // than an insert-or-skip.
      { name: "doc-a", full_text: "The tenant shall pay the rent" },
      { name: "doc-c", full_text: "A third document" },
    ]);

    const after = bundle(db, q[0]!.assignment_id);
    expect(
      after.assignment.annotations,
      "adding a document destroyed an annotation on one already there",
    ).toHaveLength(1);
    // Both halves matter, and only one of them shows up if the conflict clause
    // is DO NOTHING: the row keeps its id *and* its text is refreshed.
    expect(after.document.full_text).toBe("The tenant shall pay the rent");
    expect(after.document.id).toBe(b.document.id);
  });
});
