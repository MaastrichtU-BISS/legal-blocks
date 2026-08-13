package db

import (
	"context"
	"path/filepath"
	"testing"
)

func open(t *testing.T) *DB {
	t.Helper()
	d, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("opening database: %v", err)
	}
	t.Cleanup(func() { d.Close() })
	return d
}

// seed builds the flagship pipeline's state: a corpus, a task, two annotators
// assigned every document.
func seed(t *testing.T, d *DB) (taskID, datasetID int64, users []User) {
	t.Helper()
	ctx := context.Background()

	users, err := d.UsersByEmail(ctx, []string{"anna@example.org", "bram@example.org"})
	if err != nil {
		t.Fatalf("UsersByEmail: %v", err)
	}
	if len(users) != 2 {
		t.Fatalf("got %d users, want 2", len(users))
	}

	datasetID, err = d.CreateDataset(ctx, users[0].ID, "Rulings", "", []Document{
		{Name: "doc-a", FullText: "The tenant shall pay rent"},
		{Name: "doc-b", FullText: "The landlord may terminate"},
	})
	if err != nil {
		t.Fatalf("CreateDataset: %v", err)
	}

	taskID, err = d.SyncTask(ctx, users[0].ID, datasetID, TaskConfig{
		Name:            "Obligations",
		AnnotationLevel: "word",
		Labels:          []string{"Obligation", "Right"},
		Annotators:      2,
	})
	if err != nil {
		t.Fatalf("SyncTask: %v", err)
	}
	return taskID, datasetID, users
}

func TestSchemaAppliesAndIsIdempotent(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "test.db")

	d, err := Open(path)
	if err != nil {
		t.Fatalf("first open: %v", err)
	}
	if _, err := d.UsersByEmail(context.Background(), []string{"anna@example.org"}); err != nil {
		t.Fatalf("UsersByEmail: %v", err)
	}
	d.Close()

	// Reopening must not wipe or fail on the existing schema.
	d2, err := Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer d2.Close()
	users, err := d2.Users(context.Background())
	if err != nil {
		t.Fatalf("Users: %v", err)
	}
	if len(users) != 1 {
		t.Errorf("after reopen got %d users, want 1", len(users))
	}
}

func TestQueueAndSave(t *testing.T) {
	ctx := context.Background()
	d := open(t)
	taskID, _, users := seed(t, d)

	queue, err := d.Queue(ctx, taskID, users[0].ID)
	if err != nil {
		t.Fatalf("Queue: %v", err)
	}
	if len(queue) != 2 {
		t.Fatalf("got %d queue entries, want 2", len(queue))
	}
	if queue[0].Name != "doc-a" || queue[0].Order != 1 {
		t.Errorf("first queue entry = %+v, want doc-a at order 1", queue[0])
	}

	bundle, err := d.Bundle(ctx, queue[0].AssignmentID)
	if err != nil {
		t.Fatalf("Bundle: %v", err)
	}
	if bundle.Document.FullText != "The tenant shall pay rent" {
		t.Errorf("document text = %q", bundle.Document.FullText)
	}

	bundle.Assignment.Status = "done"
	bundle.Assignment.Confidence = 4
	bundle.Assignment.Annotations = []SpanAnnotation{
		{ID: -1, Label: "Obligation", Start: 11, End: 16, Text: "shall", Confidence: 3},
	}
	if err := d.SaveAssignment(ctx, queue[0].AssignmentID, bundle.Assignment); err != nil {
		t.Fatalf("SaveAssignment: %v", err)
	}

	reloaded, err := d.Bundle(ctx, queue[0].AssignmentID)
	if err != nil {
		t.Fatalf("Bundle after save: %v", err)
	}
	if reloaded.Assignment.Status != "done" || reloaded.Assignment.Confidence != 4 {
		t.Errorf("assignment = %+v, want status done confidence 4", reloaded.Assignment)
	}
	if len(reloaded.Assignment.Annotations) != 1 {
		t.Fatalf("got %d annotations, want 1", len(reloaded.Assignment.Annotations))
	}
	got := reloaded.Assignment.Annotations[0]
	if got.Text != "shall" || got.Start != 11 || got.End != 16 {
		t.Errorf("annotation = %+v", got)
	}
	// The client's temporary negative id must be replaced by a real one.
	if got.ID <= 0 {
		t.Errorf("annotation id = %d, want a positive stored id", got.ID)
	}
}

// Saving replaces the assignment's own annotations and must not touch anyone
// else's — the failure the previous whole-task-blob storage could not avoid.
func TestSaveIsolatesAnnotators(t *testing.T) {
	ctx := context.Background()
	d := open(t)
	taskID, _, users := seed(t, d)

	q1, _ := d.Queue(ctx, taskID, users[0].ID)
	q2, _ := d.Queue(ctx, taskID, users[1].ID)

	save := func(assignmentID int64, label string) {
		b, err := d.Bundle(ctx, assignmentID)
		if err != nil {
			t.Fatalf("Bundle: %v", err)
		}
		b.Assignment.Annotations = []SpanAnnotation{
			{ID: -1, Label: label, Start: 11, End: 16, Text: "shall"},
		}
		if err := d.SaveAssignment(ctx, assignmentID, b.Assignment); err != nil {
			t.Fatalf("SaveAssignment: %v", err)
		}
	}
	save(q1[0].AssignmentID, "Obligation")
	save(q2[0].AssignmentID, "Right")

	for _, tc := range []struct {
		id   int64
		want string
	}{
		{q1[0].AssignmentID, "Obligation"},
		{q2[0].AssignmentID, "Right"},
	} {
		b, err := d.Bundle(ctx, tc.id)
		if err != nil {
			t.Fatalf("Bundle: %v", err)
		}
		if len(b.Assignment.Annotations) != 1 || b.Assignment.Annotations[0].Label != tc.want {
			t.Errorf("assignment %d = %+v, want one %s", tc.id, b.Assignment.Annotations, tc.want)
		}
	}
}

func TestRelationsRoundTrip(t *testing.T) {
	ctx := context.Background()
	d := open(t)
	taskID, _, users := seed(t, d)
	queue, _ := d.Queue(ctx, taskID, users[0].ID)

	b, _ := d.Bundle(ctx, queue[0].AssignmentID)
	b.Assignment.Annotations = []SpanAnnotation{
		{ID: -1, Label: "Obligation", Start: 11, End: 16, Text: "shall",
			Relations: []Relation{{To: -2, Direction: "right", Labels: []string{"Part of"}}}},
		{ID: -2, Label: "Right", Start: 0, End: 10, Text: "The tenant"},
	}
	// Points at the other document in this annotator's queue.
	b.Assignment.DocumentRelations = []DocumentRelation{{To: "doc-b", Labels: []string{"Related to"}}}
	b.Assignment.DocumentAnnotations = []DocumentAnnotation{{ID: -1, Label: "Obligation", Confidence: 5}}
	if err := d.SaveAssignment(ctx, queue[0].AssignmentID, b.Assignment); err != nil {
		t.Fatalf("SaveAssignment: %v", err)
	}

	got, err := d.Bundle(ctx, queue[0].AssignmentID)
	if err != nil {
		t.Fatalf("Bundle: %v", err)
	}

	var withRelation *SpanAnnotation
	for i := range got.Assignment.Annotations {
		if len(got.Assignment.Annotations[i].Relations) > 0 {
			withRelation = &got.Assignment.Annotations[i]
		}
	}
	if withRelation == nil {
		t.Fatal("no span came back carrying a relation")
	}
	rel := withRelation.Relations[0]
	if rel.Direction != "right" || len(rel.Labels) != 1 || rel.Labels[0] != "Part of" {
		t.Errorf("relation = %+v", rel)
	}
	// The relation must point at the other span's *new* stored id.
	found := false
	for _, s := range got.Assignment.Annotations {
		if s.ID == rel.To && s.Label == "Right" {
			found = true
		}
	}
	if !found {
		t.Errorf("relation target %d does not match the stored 'Right' span", rel.To)
	}

	if len(got.Assignment.DocumentRelations) != 1 || got.Assignment.DocumentRelations[0].To != "doc-b" {
		t.Errorf("document relations = %+v, want one pointing at doc-b", got.Assignment.DocumentRelations)
	}
	if len(got.Assignment.DocumentAnnotations) != 1 {
		t.Errorf("document annotations = %+v", got.Assignment.DocumentAnnotations)
	}

	// The reverse view is computed, never stored.
	incoming, err := d.IncomingRelations(ctx, queue[1].AssignmentID)
	if err != nil {
		t.Fatalf("IncomingRelations: %v", err)
	}
	if len(incoming) != 1 || incoming[0].To != "doc-a" {
		t.Errorf("incoming = %+v, want one from doc-a", incoming)
	}
}

func TestAnnotationsFilterAndIaaInput(t *testing.T) {
	ctx := context.Background()
	d := open(t)
	taskID, _, users := seed(t, d)

	// Both annotators mark the same span on doc-a.
	for _, u := range users {
		q, _ := d.Queue(ctx, taskID, u.ID)
		b, _ := d.Bundle(ctx, q[0].AssignmentID)
		b.Assignment.Confidence = 3
		b.Assignment.Annotations = []SpanAnnotation{
			{ID: -1, Label: "Obligation", Start: 11, End: 16, Text: "shall"},
		}
		if err := d.SaveAssignment(ctx, q[0].AssignmentID, b.Assignment); err != nil {
			t.Fatalf("SaveAssignment: %v", err)
		}
	}

	all, err := d.Annotations(ctx, taskID, AnnotationFilters{})
	if err != nil {
		t.Fatalf("Annotations: %v", err)
	}
	if len(all) != 2 {
		t.Fatalf("got %d annotations, want 2", len(all))
	}

	filtered, err := d.Annotations(ctx, taskID, AnnotationFilters{
		Labels:     []string{"Obligation"},
		Annotators: []string{all[0].Annotator},
	})
	if err != nil {
		t.Fatalf("filtered Annotations: %v", err)
	}
	if len(filtered) != 1 {
		t.Errorf("filtered to %d annotations, want 1", len(filtered))
	}

	none, err := d.Annotations(ctx, taskID, AnnotationFilters{Labels: []string{"Right"}})
	if err != nil {
		t.Fatalf("Annotations: %v", err)
	}
	if len(none) != 0 {
		t.Errorf("filtering on an unused label returned %d rows", len(none))
	}

	in, err := d.IaaInput(ctx, taskID)
	if err != nil {
		t.Fatalf("IaaInput: %v", err)
	}
	if len(in.Documents) != 2 {
		t.Fatalf("IaaInput has %d documents, want 2", len(in.Documents))
	}
	docA := in.Documents[0]
	if docA.Name != "doc-a" || len(docA.Assignments) != 2 {
		t.Fatalf("doc-a = %+v", docA)
	}
	for _, a := range docA.Assignments {
		if a.DifficultyRating != 3 {
			t.Errorf("difficulty_rating = %d, want the stored confidence 3", a.DifficultyRating)
		}
		if len(a.Annotations) != 1 || a.Annotations[0].Text != "shall" {
			t.Errorf("assignment annotations = %+v", a.Annotations)
		}
	}
	if in.AnnotationLevel != "" {
		t.Errorf("annotation_level = %q, want it omitted for a span task", in.AnnotationLevel)
	}
}

// Adding a document to a dataset must not disturb annotations already made.
func TestAddingDocumentsPreservesExistingWork(t *testing.T) {
	ctx := context.Background()
	d := open(t)
	taskID, datasetID, users := seed(t, d)

	q, _ := d.Queue(ctx, taskID, users[0].ID)
	b, _ := d.Bundle(ctx, q[0].AssignmentID)
	b.Assignment.Annotations = []SpanAnnotation{
		{ID: -1, Label: "Obligation", Start: 11, End: 16, Text: "shall"},
	}
	if err := d.SaveAssignment(ctx, q[0].AssignmentID, b.Assignment); err != nil {
		t.Fatalf("SaveAssignment: %v", err)
	}

	if err := d.AddDocuments(ctx, datasetID, []Document{
		{Name: "doc-a", FullText: "The tenant shall pay rent"},
		{Name: "doc-b", FullText: "The landlord may terminate"},
		{Name: "doc-c", FullText: "A newly added document"},
	}); err != nil {
		t.Fatalf("AddDocuments: %v", err)
	}
	if _, err := d.SyncTask(ctx, users[0].ID, datasetID, TaskConfig{
		Name: "Obligations", AnnotationLevel: "word",
		Labels: []string{"Obligation", "Right"}, Annotators: 2,
	}); err != nil {
		t.Fatalf("SyncTask: %v", err)
	}

	after, err := d.Queue(ctx, taskID, users[0].ID)
	if err != nil {
		t.Fatalf("Queue: %v", err)
	}
	if len(after) != 3 {
		t.Errorf("queue grew to %d, want 3", len(after))
	}
	kept, err := d.Bundle(ctx, q[0].AssignmentID)
	if err != nil {
		t.Fatalf("Bundle: %v", err)
	}
	if len(kept.Assignment.Annotations) != 1 {
		t.Errorf("annotations after adding a document = %d, want the original 1 kept",
			len(kept.Assignment.Annotations))
	}
}

func TestDocumentLevelTaskFeedsIaa(t *testing.T) {
	ctx := context.Background()
	d := open(t)
	users, _ := d.UsersByEmail(ctx, []string{"anna@example.org", "bram@example.org"})
	datasetID, _ := d.CreateDataset(ctx, users[0].ID, "Rulings", "", []Document{
		{Name: "doc-a", FullText: "text"},
	})
	taskID, err := d.SyncTask(ctx, users[0].ID, datasetID, TaskConfig{
		Name: "Tagging", AnnotationLevel: "document",
		Labels: []string{"Relevant"}, Annotators: 2,
	})
	if err != nil {
		t.Fatalf("SyncTask: %v", err)
	}

	for _, u := range users {
		q, _ := d.Queue(ctx, taskID, u.ID)
		b, _ := d.Bundle(ctx, q[0].AssignmentID)
		b.Assignment.DocumentAnnotations = []DocumentAnnotation{{ID: -1, Label: "Relevant", Confidence: 4}}
		if err := d.SaveAssignment(ctx, q[0].AssignmentID, b.Assignment); err != nil {
			t.Fatalf("SaveAssignment: %v", err)
		}
	}

	in, err := d.IaaInput(ctx, taskID)
	if err != nil {
		t.Fatalf("IaaInput: %v", err)
	}
	if in.AnnotationLevel != "document" {
		t.Errorf("annotation_level = %q, want document", in.AnnotationLevel)
	}
	for _, a := range in.Documents[0].Assignments {
		if len(a.Annotations) != 1 || a.Annotations[0].Label != "Relevant" {
			t.Errorf("document tags did not reach the IAA input: %+v", a.Annotations)
		}
		if a.Annotations[0].Start != 0 || a.Annotations[0].End != 0 {
			t.Errorf("document tag should have no extent, got %+v", a.Annotations[0])
		}
	}
}
