import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  taskExport,
  taskProgress,
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

describe("task progress", () => {
  // The three cuts have to agree, because they are read together and a reader
  // will do the arithmetic. Both annotators starting the same document is the
  // case worth pinning: the totals are identical either way, and only the
  // per-document cut shows that half the corpus is untouched.
  it("counts started assignments per annotator and per document", () => {
    const { taskId, people } = seed();

    // Anna and Bram each annotate doc-a, and neither touches doc-b.
    for (const person of people) {
      const q = queue(db, taskId, person.id);
      const first = q.find((e) => e.name === "doc-a")!;
      const b = bundle(db, first.assignment_id);
      b.assignment.annotations = [
        { id: -1, start: 0, end: 3, text: "The", label: "Obligation", confidence: 4, relations: [] },
      ];
      saveAssignment(db, first.assignment_id, b.assignment);
    }

    const p = taskProgress(db, taskId);

    expect(p.total).toBe(4);
    expect(p.done).toBe(2);
    // Both saves left the assignment pending, so nothing is finished. The two
    // counts moving together would mean the badge can never say "working on
    // it", which is the state most of a task spends its life in.
    expect(p.finished).toBe(0);

    expect(p.byAnnotator.map((r) => [r.name, r.done, r.finished, r.total])).toEqual([
      ["anna@example.org", 1, 0, 2],
      ["bram@example.org", 1, 0, 2],
    ]);

    expect(p.byDocument.map((r) => [r.name, r.done, r.finished, r.total])).toEqual([
      ["doc-a", 2, 0, 2],
      ["doc-b", 0, 0, 2],
    ]);

    // The cuts are two groupings of one set, so both must sum to the whole.
    const sum = (rows: { done: number; total: number }[]) => ({
      done: rows.reduce((n, r) => n + r.done, 0),
      total: rows.reduce((n, r) => n + r.total, 0),
    });
    expect(sum(p.byAnnotator)).toEqual({ done: p.done, total: p.total });
    expect(sum(p.byDocument)).toEqual({ done: p.done, total: p.total });
  });

  // A document-level tag with no spans is still work somebody did. Counting
  // only span_annotations would report an annotator who tagged every document
  // as having started nothing.
  it("counts a document-level tag as started", () => {
    const { taskId, people } = seed();
    const q = queue(db, taskId, people[0]!.id);
    const b = bundle(db, q[0]!.assignment_id);
    b.assignment.annotations = [];
    b.assignment.document_annotations = [{ id: -1, label: "Obligation", confidence: 5 }];
    saveAssignment(db, q[0]!.assignment_id, b.assignment);

    expect(taskProgress(db, taskId).done).toBe(1);
  });

  // Started and finished are different questions and the badge depends on the
  // difference: a document every annotator has opened and none has submitted
  // must not read as ready to measure.
  it("counts finished separately from started", () => {
    const { taskId, people } = seed();
    const q = queue(db, taskId, people[0]!.id);
    const b = bundle(db, q[0]!.assignment_id);
    b.assignment.annotations = [
      { id: -1, start: 0, end: 3, text: "The", label: "Obligation", confidence: 4, relations: [] },
    ];
    b.assignment.status = "done";
    saveAssignment(db, q[0]!.assignment_id, b.assignment);

    const p = taskProgress(db, taskId);
    expect(p.done).toBe(1);
    expect(p.finished).toBe(1);

    // And the other annotator's copy of the same document is neither.
    const other = p.byAnnotator.find((r) => r.name === "bram@example.org")!;
    expect([other.done, other.finished]).toEqual([0, 0]);
  });
});

describe("exporting a task", () => {
  // The download is the thing somebody keeps. It has to carry what the task
  // WAS, not only what was marked on it — the IAA input carried the second
  // without the first, which is what this replaces.
  it("carries the task itself, not just its annotations", () => {
    const { taskId, people } = seed();
    const q = queue(db, taskId, people[0]!.id);
    const b = bundle(db, q[0]!.assignment_id);
    b.assignment.annotations = [
      { id: -1, start: 0, end: 3, text: "The", label: "Obligation", confidence: 4, relations: [] },
    ];
    saveAssignment(db, q[0]!.assignment_id, b.assignment);

    const out = taskExport(db, taskId);

    expect(out.name).toBe("Obligations");
    expect(out.annotation_level).toBe("word");
    expect(out.labelset.labels.map((l) => l.name)).toEqual(["Obligation", "Right"]);
    expect(out).toHaveProperty("desc");
    expect(out).toHaveProperty("ann_guidelines");

    // Two annotators over two documents, one annotation made.
    expect(out.counts).toEqual({
      documents: 2,
      assignments: 4,
      annotators: 2,
      annotations: 1,
      relations: 0,
    });
  });

  // The counts are what a reader checks the file against, so they have to
  // describe the file rather than the database.
  it("counts what it actually wrote", () => {
    const { taskId } = seed();
    const out = taskExport(db, taskId);

    expect(out.counts.documents).toBe(out.documents.length);
    expect(out.counts.assignments).toBe(
      out.documents.reduce((n, d) => n + d.assignments.length, 0),
    );
    expect(out.counts.annotations).toBe(
      out.documents.reduce((n, d) => n + d.assignments.reduce((m, a) => m + a.annotations.length, 0), 0),
    );
  });

  // Annotators are numbered, not named: an export gets sent on, and who
  // annotated what is not usually part of the result.
  it("numbers annotators from one instead of naming them", () => {
    const { taskId } = seed();
    const numbers = taskExport(db, taskId)
      .documents.flatMap((d) => d.assignments.map((a) => a.annotator))
      .sort();
    expect([...new Set(numbers)]).toEqual([1, 2]);
    expect(JSON.stringify(taskExport(db, taskId))).not.toContain("@example.org");
  });

  // Relations point at row ids in storage, which mean nothing in a file. They
  // have to come out as positions or they are unreadable anywhere else.
  it("rewrites relations as positions within the assignment", () => {
    const { taskId, people } = seed();
    const q = queue(db, taskId, people[0]!.id);
    const b = bundle(db, q[0]!.assignment_id);
    b.assignment.annotations = [
      { id: -1, start: 0, end: 3, text: "The", label: "Obligation", confidence: 0,
        relations: [{ to: -2, direction: "right", labels: ["Part of"] }] },
      { id: -2, start: 4, end: 10, text: "tenant", label: "Right", confidence: 0, relations: [] },
    ];
    saveAssignment(db, q[0]!.assignment_id, b.assignment);

    const out = taskExport(db, taskId);
    const withRel = out.documents
      .flatMap((d) => d.assignments)
      .flatMap((a) => a.annotations)
      .find((a) => a.relations.length > 0);

    expect(withRel, "no relation survived the export").toBeDefined();
    // A position, not a row id: the second annotation of the same assignment.
    expect(withRel!.relations[0]!.to).toBe(1);
    expect(out.counts.relations).toBe(1);
  });
});
