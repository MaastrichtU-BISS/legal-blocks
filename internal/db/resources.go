package db

// The three things a running platform lets people make: labelsets, datasets,
// and the tasks that join them.
//
// Everything here is created by whoever is using the exported platform rather
// than by whoever assembled it. That is the difference between a platform and
// an appliance, and it is why these are ordinary rows with ordinary lists
// rather than something derived from the pipeline: the pipeline says the
// platform can run annotation tasks, and the people using it decide which.
//
// Labelsets and datasets stand alone deliberately. Making a labelset part of
// task creation would mean retyping the same labels for the second task, and
// the same documents can carry two tasks that label them differently — which
// is the case worth supporting, since comparing those is the point of a lot of
// annotation work.

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

// ---------------------------------------------------------------------------
// labelsets
// ---------------------------------------------------------------------------

// LabelsetSummary is one row of the labelsets tab.
type LabelsetSummary struct {
	ID     int64   `json:"id"`
	Name   string  `json:"name"`
	Desc   string  `json:"desc"`
	Labels []Label `json:"labels"`
	// Tasks using it, so deleting one can say what it would take with it.
	TaskCount int `json:"task_count"`
}

// Labelsets lists every labelset, newest first.
func (d *DB) Labelsets(ctx context.Context) ([]LabelsetSummary, error) {
	rows, err := d.sql.QueryContext(ctx,
		`SELECT l.id, l.name, l."desc", l.labels,
		        (SELECT COUNT(*) FROM tasks t WHERE t.labelset_id = l.id)
		 FROM labelsets l ORDER BY l.id DESC`)
	if err != nil {
		return nil, fmt.Errorf("listing labelsets: %w", err)
	}
	defer rows.Close()

	out := []LabelsetSummary{}
	for rows.Next() {
		var s LabelsetSummary
		var labels string
		if err := rows.Scan(&s.ID, &s.Name, &s.Desc, &labels, &s.TaskCount); err != nil {
			return nil, fmt.Errorf("reading labelset: %w", err)
		}
		if err := json.Unmarshal([]byte(labels), &s.Labels); err != nil {
			s.Labels = []Label{}
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// CreateLabelset stores a new labelset and returns its id.
//
// Colours are assigned here when the caller did not choose them, so every
// labelset looks deliberate without anyone having to pick from a colour wheel
// to get started.
func (d *DB) CreateLabelset(ctx context.Context, ownerID int64, name, desc string, labels []Label) (int64, error) {
	filled := make([]Label, 0, len(labels))
	for i, l := range labels {
		l.Name = strings.TrimSpace(l.Name)
		if l.Name == "" {
			continue
		}
		if l.Color == "" {
			l.Color = palette[i%len(palette)]
		}
		filled = append(filled, l)
	}
	if len(filled) == 0 {
		return 0, fmt.Errorf("a labelset needs at least one label")
	}

	encoded, err := json.Marshal(filled)
	if err != nil {
		return 0, fmt.Errorf("encoding labels: %w", err)
	}

	var id int64
	err = d.tx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx,
			`INSERT INTO labelsets (user_id, name, "desc", labels) VALUES (?, ?, ?, ?)`,
			ownerID, strings.TrimSpace(name), desc, string(encoded))
		if err != nil {
			return fmt.Errorf("creating labelset: %w", err)
		}
		id, err = res.LastInsertId()
		return err
	})
	return id, err
}

// ---------------------------------------------------------------------------
// datasets
// ---------------------------------------------------------------------------

// DatasetSummary is one row of the datasets tab.
type DatasetSummary struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Desc      string `json:"desc"`
	Documents int    `json:"documents"`
	TaskCount int    `json:"task_count"`
}

// Datasets lists every dataset, newest first.
func (d *DB) Datasets(ctx context.Context) ([]DatasetSummary, error) {
	rows, err := d.sql.QueryContext(ctx,
		`SELECT ds.id, ds.name, ds."desc",
		        (SELECT COUNT(*) FROM documents doc WHERE doc.dataset_id = ds.id),
		        (SELECT COUNT(*) FROM tasks t WHERE t.dataset_id = ds.id)
		 FROM datasets ds ORDER BY ds.id DESC`)
	if err != nil {
		return nil, fmt.Errorf("listing datasets: %w", err)
	}
	defer rows.Close()

	out := []DatasetSummary{}
	for rows.Next() {
		var s DatasetSummary
		if err := rows.Scan(&s.ID, &s.Name, &s.Desc, &s.Documents, &s.TaskCount); err != nil {
			return nil, fmt.Errorf("reading dataset: %w", err)
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

// CreateDataset stores a new dataset with its documents and returns its id.
func (d *DB) CreateDataset(ctx context.Context, ownerID int64, name, desc string, docs []Document) (int64, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return 0, fmt.Errorf("a dataset needs a name")
	}

	var id int64
	err := d.tx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx,
			`INSERT INTO datasets (user_id, name, "desc") VALUES (?, ?, ?)`, ownerID, name, desc)
		if err != nil {
			return fmt.Errorf("creating dataset %q: %w", name, err)
		}
		if id, err = res.LastInsertId(); err != nil {
			return err
		}
		return insertDocuments(ctx, tx, id, docs)
	})
	return id, err
}

// AddDocuments appends documents to an existing dataset.
//
// A document already in the dataset keeps its id and its text is refreshed:
// re-importing a folder must not destroy annotations on the files that were
// already there.
func (d *DB) AddDocuments(ctx context.Context, datasetID int64, docs []Document) error {
	return d.tx(ctx, func(tx *sql.Tx) error {
		return insertDocuments(ctx, tx, datasetID, docs)
	})
}

func insertDocuments(ctx context.Context, tx *sql.Tx, datasetID int64, docs []Document) error {
	for _, doc := range docs {
		name := strings.TrimSpace(doc.Name)
		if name == "" {
			continue
		}
		source := doc.Source
		if source == "" {
			source = name
		}
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO documents (dataset_id, name, source, full_text)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT (dataset_id, name) DO UPDATE SET full_text = excluded.full_text`,
			datasetID, name, source, doc.FullText); err != nil {
			return fmt.Errorf("storing document %q: %w", name, err)
		}
	}
	return nil
}

// ---------------------------------------------------------------------------
// tasks
// ---------------------------------------------------------------------------

// TaskSpec is what somebody fills in on the "new task" form.
type TaskSpec struct {
	Name            string `json:"name"`
	Desc            string `json:"desc"`
	DatasetID       int64  `json:"dataset_id"`
	LabelsetID      int64  `json:"labelset_id"`
	AnnotationLevel string `json:"annotation_level"`
	Guidelines      string `json:"ann_guidelines"`
	// Annotators are email addresses. They need not belong to anyone who has
	// used this platform before — see UsersByEmail.
	Annotators []string `json:"annotators"`
}

// TaskSummary is one row of the tasks tab.
type TaskSummary struct {
	ID              int64  `json:"id"`
	Name            string `json:"name"`
	Desc            string `json:"desc"`
	AnnotationLevel string `json:"annotation_level"`
	DatasetID       int64  `json:"dataset_id"`
	DatasetName     string `json:"dataset_name"`
	LabelsetID      int64  `json:"labelset_id"`
	LabelsetName    string `json:"labelset_name"`
	Annotators      []User `json:"annotators"`
	Documents       int    `json:"documents"`
	// Assignments touched at all, over assignments in total.
	Done  int `json:"done"`
	Total int `json:"total"`
}

// Tasks lists every task with enough detail to show a row, newest first.
func (d *DB) Tasks(ctx context.Context) ([]TaskSummary, error) {
	rows, err := d.sql.QueryContext(ctx,
		`SELECT t.id, t.name, t."desc", t.annotation_level,
		        COALESCE(t.dataset_id, 0), COALESCE(ds.name, ''),
		        COALESCE(t.labelset_id, 0), COALESCE(l.name, ''),
		        (SELECT COUNT(DISTINCT a.document_id) FROM assignments a WHERE a.task_id = t.id),
		        (SELECT COUNT(*) FROM assignments a WHERE a.task_id = t.id),
		        (SELECT COUNT(*) FROM assignments a
		           WHERE a.task_id = t.id
		             AND (EXISTS (SELECT 1 FROM span_annotations s WHERE s.assignment_id = a.id)
		               OR EXISTS (SELECT 1 FROM document_annotations da WHERE da.assignment_id = a.id)))
		 FROM tasks t
		 LEFT JOIN datasets ds ON ds.id = t.dataset_id
		 LEFT JOIN labelsets l ON l.id = t.labelset_id
		 ORDER BY t.id DESC`)
	if err != nil {
		return nil, fmt.Errorf("listing tasks: %w", err)
	}
	defer rows.Close()

	out := []TaskSummary{}
	for rows.Next() {
		var s TaskSummary
		if err := rows.Scan(&s.ID, &s.Name, &s.Desc, &s.AnnotationLevel,
			&s.DatasetID, &s.DatasetName, &s.LabelsetID, &s.LabelsetName,
			&s.Documents, &s.Total, &s.Done); err != nil {
			return nil, fmt.Errorf("reading task: %w", err)
		}
		s.Annotators = []User{}
		out = append(out, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Annotators per task, in one pass rather than a query each.
	people, err := d.sql.QueryContext(ctx,
		`SELECT DISTINCT a.task_id, u.id, u.name, COALESCE(u.email, ''), u.role
		 FROM assignments a JOIN users u ON u.id = a.user_id
		 ORDER BY a.task_id, u.id`)
	if err != nil {
		return nil, fmt.Errorf("listing task annotators: %w", err)
	}
	defer people.Close()

	byTask := map[int64][]User{}
	for people.Next() {
		var taskID int64
		var u User
		if err := people.Scan(&taskID, &u.ID, &u.Name, &u.Email, &u.Role); err != nil {
			return nil, fmt.Errorf("reading annotator: %w", err)
		}
		byTask[taskID] = append(byTask[taskID], u)
	}
	if err := people.Err(); err != nil {
		return nil, err
	}
	for i := range out {
		if us, ok := byTask[out[i].ID]; ok {
			out[i].Annotators = us
		}
	}
	return out, nil
}

// CreateTask makes a task over a dataset with a labelset, and gives every
// named annotator every document in the dataset.
//
// Every annotator sees every document, which is the simplest scheme that still
// produces the overlap agreement metrics need. Anything more selective —
// splitting a corpus between people, overlapping only a sample — is a
// scheduling decision that deserves its own screen rather than a hidden rule.
func (d *DB) CreateTask(ctx context.Context, ownerID int64, spec TaskSpec) (int64, error) {
	if spec.DatasetID == 0 {
		return 0, fmt.Errorf("a task needs a dataset")
	}
	if spec.LabelsetID == 0 {
		return 0, fmt.Errorf("a task needs a labelset")
	}
	level := spec.AnnotationLevel
	if level == "" {
		level = "word"
	}

	annotators, err := d.UsersByEmail(ctx, spec.Annotators)
	if err != nil {
		return 0, err
	}
	if len(annotators) == 0 {
		return 0, fmt.Errorf("a task needs at least one annotator's email address")
	}

	var taskID int64
	err = d.tx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx,
			`INSERT INTO tasks (user_id, dataset_id, labelset_id, name, "desc", ann_guidelines, annotation_level)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`,
			ownerID, spec.DatasetID, spec.LabelsetID,
			strings.TrimSpace(spec.Name), spec.Desc, spec.Guidelines, level)
		if err != nil {
			return fmt.Errorf("creating task: %w", err)
		}
		if taskID, err = res.LastInsertId(); err != nil {
			return err
		}

		docRows, err := tx.QueryContext(ctx,
			`SELECT id FROM documents WHERE dataset_id = ? ORDER BY name`, spec.DatasetID)
		if err != nil {
			return fmt.Errorf("listing documents: %w", err)
		}
		var docIDs []int64
		for docRows.Next() {
			var id int64
			if err := docRows.Scan(&id); err != nil {
				docRows.Close()
				return err
			}
			docIDs = append(docIDs, id)
		}
		docRows.Close()
		if err := docRows.Err(); err != nil {
			return err
		}
		if len(docIDs) == 0 {
			return fmt.Errorf("that dataset has no documents yet")
		}

		for _, u := range annotators {
			for i, docID := range docIDs {
				if _, err := tx.ExecContext(ctx,
					`INSERT INTO assignments (user_id, document_id, task_id, "order")
					 VALUES (?, ?, ?, ?)`,
					u.ID, docID, taskID, i+1); err != nil {
					return fmt.Errorf("assigning %s: %w", u.Email, err)
				}
			}
		}
		return nil
	})
	return taskID, err
}
