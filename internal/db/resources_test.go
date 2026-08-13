package db

import (
	"context"
	"strings"
	"testing"
)

// The shape the whole design is for: documents uploaded once, labelsets made
// once, and two tasks over the same documents labelling them differently.
// Baking task settings into the export made this impossible to express.
func TestTwoTasksShareOneDataset(t *testing.T) {
	ctx := context.Background()
	d := open(t)

	owner, err := d.UsersByEmail(ctx, []string{"editor@example.org"})
	if err != nil {
		t.Fatalf("UsersByEmail: %v", err)
	}

	datasetID, err := d.CreateDataset(ctx, owner[0].ID, "Tenancy cases", "", []Document{
		{Name: "doc-a", FullText: "The tenant shall pay rent"},
		{Name: "doc-b", FullText: "The landlord may terminate"},
	})
	if err != nil {
		t.Fatalf("CreateDataset: %v", err)
	}

	obligations, err := d.CreateLabelset(ctx, owner[0].ID, "Obligations", "",
		[]Label{{Name: "Obligation"}, {Name: "Right"}})
	if err != nil {
		t.Fatalf("CreateLabelset: %v", err)
	}
	sentiment, err := d.CreateLabelset(ctx, owner[0].ID, "Outcome", "",
		[]Label{{Name: "Granted"}, {Name: "Refused"}})
	if err != nil {
		t.Fatalf("CreateLabelset: %v", err)
	}

	first, err := d.CreateTask(ctx, owner[0].ID, TaskSpec{
		Name: "Obligation spans", DatasetID: datasetID, LabelsetID: obligations,
		AnnotationLevel: "word", Annotators: []string{"anna@example.org", "bram@example.org"},
	})
	if err != nil {
		t.Fatalf("CreateTask: %v", err)
	}
	second, err := d.CreateTask(ctx, owner[0].ID, TaskSpec{
		Name: "Outcome tagging", DatasetID: datasetID, LabelsetID: sentiment,
		AnnotationLevel: "document", Annotators: []string{"anna@example.org"},
	})
	if err != nil {
		t.Fatalf("second CreateTask: %v", err)
	}
	if first == second {
		t.Fatal("both tasks got the same id")
	}

	tasks, err := d.Tasks(ctx)
	if err != nil {
		t.Fatalf("Tasks: %v", err)
	}
	if len(tasks) != 2 {
		t.Fatalf("got %d tasks, want 2", len(tasks))
	}
	// Newest first.
	if tasks[0].Name != "Outcome tagging" || tasks[1].Name != "Obligation spans" {
		t.Errorf("tasks = %+v", tasks)
	}
	for _, tk := range tasks {
		if tk.DatasetName != "Tenancy cases" {
			t.Errorf("task %q dataset = %q, want the shared one", tk.Name, tk.DatasetName)
		}
		if tk.Documents != 2 {
			t.Errorf("task %q covers %d documents, want 2", tk.Name, tk.Documents)
		}
	}
	if tasks[0].LabelsetName != "Outcome" || tasks[1].LabelsetName != "Obligations" {
		t.Error("the two tasks did not keep their own labelsets")
	}
	if len(tasks[1].Annotators) != 2 || len(tasks[0].Annotators) != 1 {
		t.Errorf("annotator counts = %d and %d, want 2 and 1",
			len(tasks[1].Annotators), len(tasks[0].Annotators))
	}
	// Two annotators over two documents.
	if tasks[1].Total != 4 {
		t.Errorf("assignments = %d, want 4", tasks[1].Total)
	}
}

// Annotators are named by email before they have ever opened the platform, and
// the same person named twice must not become two annotators with half the
// work each.
func TestAnnotatorsAreFoundByEmail(t *testing.T) {
	ctx := context.Background()
	d := open(t)

	first, err := d.UsersByEmail(ctx, []string{"Anna@Example.org"})
	if err != nil {
		t.Fatalf("UsersByEmail: %v", err)
	}
	again, err := d.UsersByEmail(ctx, []string{"  anna@example.org  ", "anna@example.org"})
	if err != nil {
		t.Fatalf("UsersByEmail again: %v", err)
	}
	if len(again) != 1 {
		t.Fatalf("got %d users for one address twice, want 1", len(again))
	}
	if again[0].ID != first[0].ID {
		t.Error("the same address in different case produced two users")
	}
	if again[0].Email != "anna@example.org" {
		t.Errorf("stored email = %q, want it lowercased", again[0].Email)
	}
	// Something recognisable in a metrics report, not "Annotator 3".
	if again[0].Name != "anna" {
		t.Errorf("name = %q, want the local part as a placeholder", again[0].Name)
	}
}

// Order is preserved so the first address typed is annotator 1 everywhere.
func TestUsersByEmailKeepsTheGivenOrder(t *testing.T) {
	ctx := context.Background()
	d := open(t)

	_, _ = d.UsersByEmail(ctx, []string{"zoe@example.org"})
	got, err := d.UsersByEmail(ctx, []string{"anna@example.org", "zoe@example.org"})
	if err != nil {
		t.Fatalf("UsersByEmail: %v", err)
	}
	if len(got) != 2 || got[0].Email != "anna@example.org" || got[1].Email != "zoe@example.org" {
		t.Errorf("got %+v, want the order asked for rather than id order", got)
	}
}

func TestCreateTaskRefusesWhatItCannotDo(t *testing.T) {
	ctx := context.Background()
	d := open(t)
	owner, _ := d.UsersByEmail(ctx, []string{"editor@example.org"})
	empty, _ := d.CreateDataset(ctx, owner[0].ID, "Empty", "", nil)
	ls, _ := d.CreateLabelset(ctx, owner[0].ID, "Labels", "", []Label{{Name: "A"}})

	for _, tc := range []struct {
		name string
		spec TaskSpec
		want string
	}{
		{"no dataset", TaskSpec{LabelsetID: ls, Annotators: []string{"a@b.c"}}, "dataset"},
		{"no labelset", TaskSpec{DatasetID: empty, Annotators: []string{"a@b.c"}}, "labelset"},
		{"no annotators", TaskSpec{DatasetID: empty, LabelsetID: ls}, "annotator"},
		{"empty dataset", TaskSpec{DatasetID: empty, LabelsetID: ls, Annotators: []string{"a@b.c"}}, "no documents"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := d.CreateTask(ctx, owner[0].ID, tc.spec); err == nil {
				t.Fatal("expected an error")
			} else if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("error = %q, want it to mention %q", err, tc.want)
			}
		})
	}
}

// A labelset with nothing in it would produce a task nobody can work on.
func TestLabelsetNeedsLabels(t *testing.T) {
	ctx := context.Background()
	d := open(t)
	owner, _ := d.UsersByEmail(ctx, []string{"editor@example.org"})

	if _, err := d.CreateLabelset(ctx, owner[0].ID, "Empty", "", []Label{{Name: "  "}}); err == nil {
		t.Error("a labelset of blank names was accepted")
	}

	id, err := d.CreateLabelset(ctx, owner[0].ID, "Colours", "", []Label{{Name: "A"}, {Name: "B", Color: "#123456"}})
	if err != nil {
		t.Fatalf("CreateLabelset: %v", err)
	}
	sets, _ := d.Labelsets(ctx)
	var got LabelsetSummary
	for _, s := range sets {
		if s.ID == id {
			got = s
		}
	}
	if len(got.Labels) != 2 {
		t.Fatalf("labels = %+v", got.Labels)
	}
	if got.Labels[0].Color == "" {
		t.Error("a label with no colour should be given one")
	}
	if got.Labels[1].Color != "#123456" {
		t.Error("a chosen colour was overwritten")
	}
}
