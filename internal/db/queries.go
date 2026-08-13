package db

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
)

// ErrNotFound is returned when a requested row does not exist.
var ErrNotFound = errors.New("not found")

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

// UsersByEmail resolves each address to a user, creating one for any it has
// not seen, and returns them in the order given.
//
// This is how annotators join a platform. Whoever sets up a task types the
// addresses of the people who should do it, and those people have almost
// certainly never opened it — so a row is created for them and the assignment
// has something to point at. Nobody is notified, which is the honest gap:
// somebody has to tell them the platform exists. When they do arrive and sign
// in with that address they become this row rather than a second one, which is
// the whole reason the address is what identifies them.
//
// Addresses are matched case-insensitively and stored lowercased. Anna typing
// her own address in one case and her colleague typing it in another must not
// produce two annotators with half the work each.
func (d *DB) UsersByEmail(ctx context.Context, emails []string) ([]User, error) {
	cleaned := make([]string, 0, len(emails))
	seen := map[string]bool{}
	for _, e := range emails {
		e = strings.ToLower(strings.TrimSpace(e))
		if e == "" || seen[e] {
			continue
		}
		seen[e] = true
		cleaned = append(cleaned, e)
	}
	if len(cleaned) == 0 {
		return []User{}, nil
	}

	err := d.tx(ctx, func(tx *sql.Tx) error {
		for _, email := range cleaned {
			// The name is a placeholder until they introduce themselves. The
			// local part is a better guess than "Annotator 3" and is what a
			// reviewer will recognise in a metrics report.
			name := email
			if at := strings.IndexByte(email, '@'); at > 0 {
				name = email[:at]
			}
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO users (name, email, role) VALUES (?, ?, 'annotator')
				 ON CONFLICT (email) DO NOTHING`, name, email); err != nil {
				return fmt.Errorf("adding %s: %w", email, err)
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	byEmail := map[string]User{}
	all, err := d.Users(ctx)
	if err != nil {
		return nil, err
	}
	for _, u := range all {
		byEmail[u.Email] = u
	}

	out := make([]User, 0, len(cleaned))
	for _, email := range cleaned {
		if u, ok := byEmail[email]; ok {
			out = append(out, u)
		}
	}
	return out, nil
}

// Users lists everyone, in id order.
func (d *DB) Users(ctx context.Context) ([]User, error) {
	rows, err := d.sql.QueryContext(ctx,
		`SELECT id, name, COALESCE(email, ''), role FROM users ORDER BY id`)
	if err != nil {
		return nil, fmt.Errorf("listing users: %w", err)
	}
	defer rows.Close()

	users := []User{}
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Name, &u.Email, &u.Role); err != nil {
			return nil, fmt.Errorf("reading user: %w", err)
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

// ---------------------------------------------------------------------------
// datasets
// ---------------------------------------------------------------------------

// DatasetDocuments lists a dataset's documents in name order.
func (d *DB) DatasetDocuments(ctx context.Context, datasetID int64) ([]Document, error) {
	rows, err := d.sql.QueryContext(ctx,
		`SELECT id, name, full_text FROM documents WHERE dataset_id = ? ORDER BY name`, datasetID)
	if err != nil {
		return nil, fmt.Errorf("listing documents: %w", err)
	}
	defer rows.Close()

	docs := []Document{}
	for rows.Next() {
		var doc Document
		if err := rows.Scan(&doc.ID, &doc.Name, &doc.FullText); err != nil {
			return nil, fmt.Errorf("reading document: %w", err)
		}
		docs = append(docs, doc)
	}
	return docs, rows.Err()
}

// ---------------------------------------------------------------------------
// tasks
// ---------------------------------------------------------------------------

// SyncTask creates or updates the task for a dataset and makes sure every user
// has an assignment for every document, in queue order.
//
// Idempotent, and called every time the annotate step is opened, so changing
// the labels or the number of annotators takes effect without losing anything
// already annotated. Assignments are only ever added — removing one would
// delete that annotator's work with it.
func (d *DB) SyncTask(ctx context.Context, ownerID, datasetID int64, cfg TaskConfig) (int64, error) {
	labels := make([]Label, 0, len(cfg.Labels))
	for i, name := range cfg.Labels {
		labels = append(labels, Label{Name: name, Color: palette[i%len(palette)]})
	}
	labelsJSON, err := json.Marshal(labels)
	if err != nil {
		return 0, fmt.Errorf("encoding labels: %w", err)
	}

	level := cfg.AnnotationLevel
	if level == "" {
		level = "word"
	}

	var taskID int64
	err = d.tx(ctx, func(tx *sql.Tx) error {
		// One task per dataset, since a pipeline holds one annotate step.
		var labelsetID int64
		err := tx.QueryRowContext(ctx,
			`SELECT t.id, t.labelset_id FROM tasks t
			 JOIN assignments a ON a.task_id = t.id
			 JOIN documents doc ON doc.id = a.document_id
			 WHERE doc.dataset_id = ? LIMIT 1`, datasetID).Scan(&taskID, &labelsetID)

		if errors.Is(err, sql.ErrNoRows) {
			// No task yet, or one with no assignments: look for a bare task.
			err = tx.QueryRowContext(ctx,
				`SELECT id, labelset_id FROM tasks WHERE user_id = ? ORDER BY id LIMIT 1`,
				ownerID).Scan(&taskID, &labelsetID)
		}
		if errors.Is(err, sql.ErrNoRows) {
			res, err := tx.ExecContext(ctx,
				`INSERT INTO labelsets (user_id, name, labels) VALUES (?, 'Labels', ?)`,
				ownerID, string(labelsJSON))
			if err != nil {
				return fmt.Errorf("creating labelset: %w", err)
			}
			if labelsetID, err = res.LastInsertId(); err != nil {
				return err
			}
			res, err = tx.ExecContext(ctx,
				`INSERT INTO tasks (user_id, labelset_id, name, ann_guidelines, annotation_level)
				 VALUES (?, ?, ?, ?, ?)`,
				ownerID, labelsetID, cfg.Name, cfg.Guidelines, level)
			if err != nil {
				return fmt.Errorf("creating task: %w", err)
			}
			if taskID, err = res.LastInsertId(); err != nil {
				return err
			}
		} else if err != nil {
			return fmt.Errorf("finding task: %w", err)
		} else {
			if _, err := tx.ExecContext(ctx,
				`UPDATE tasks SET name = ?, ann_guidelines = ?, annotation_level = ? WHERE id = ?`,
				cfg.Name, cfg.Guidelines, level, taskID); err != nil {
				return fmt.Errorf("updating task: %w", err)
			}
			if _, err := tx.ExecContext(ctx,
				`UPDATE labelsets SET labels = ? WHERE id = ?`,
				string(labelsJSON), labelsetID); err != nil {
				return fmt.Errorf("updating labelset: %w", err)
			}
		}

		// Every user gets every document, in the dataset's name order. The
		// simplest scheme that still produces the overlap agreement needs;
		// anything more selective is a scheduling feature and belongs in a
		// module of its own.
		userRows, err := tx.QueryContext(ctx,
			`SELECT id FROM users ORDER BY id LIMIT ?`, max(cfg.Annotators, 1))
		if err != nil {
			return fmt.Errorf("listing users: %w", err)
		}
		var userIDs []int64
		for userRows.Next() {
			var id int64
			if err := userRows.Scan(&id); err != nil {
				userRows.Close()
				return err
			}
			userIDs = append(userIDs, id)
		}
		userRows.Close()
		if err := userRows.Err(); err != nil {
			return err
		}

		docRows, err := tx.QueryContext(ctx,
			`SELECT id FROM documents WHERE dataset_id = ? ORDER BY name`, datasetID)
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

		for _, uid := range userIDs {
			for i, did := range docIDs {
				_, err := tx.ExecContext(ctx,
					`INSERT INTO assignments (user_id, document_id, task_id, "order")
					 VALUES (?, ?, ?, ?)
					 ON CONFLICT (task_id, document_id, user_id) DO UPDATE SET "order" = excluded."order"`,
					uid, did, taskID, i+1)
				if err != nil {
					return fmt.Errorf("creating assignment: %w", err)
				}
			}
		}
		return nil
	})
	return taskID, err
}

// palette supplies label colours when the settings give only names.
var palette = []string{
	"#2563eb", "#dc2626", "#059669", "#d97706",
	"#7c3aed", "#0891b2", "#db2777", "#65a30d",
}

// Task returns a task with its labelset resolved.
func (d *DB) Task(ctx context.Context, taskID int64) (Task, error) {
	var t Task
	var labelsJSON sql.NullString
	var lsName, lsDesc sql.NullString
	err := d.sql.QueryRowContext(ctx,
		`SELECT t.id, t.name, t."desc", t.ann_guidelines, t.annotation_level,
		        l.name, l."desc", l.labels
		 FROM tasks t LEFT JOIN labelsets l ON l.id = t.labelset_id
		 WHERE t.id = ?`, taskID,
	).Scan(&t.ID, &t.Name, &t.Desc, &t.AnnGuidelines, &t.AnnotationLevel, &lsName, &lsDesc, &labelsJSON)
	if errors.Is(err, sql.ErrNoRows) {
		return t, ErrNotFound
	}
	if err != nil {
		return t, fmt.Errorf("reading task: %w", err)
	}

	t.Labelset = Labelset{Name: lsName.String, Desc: lsDesc.String, Labels: []Label{}}
	if labelsJSON.Valid && labelsJSON.String != "" {
		if err := json.Unmarshal([]byte(labelsJSON.String), &t.Labelset.Labels); err != nil {
			return t, fmt.Errorf("decoding labels: %w", err)
		}
	}
	return t, nil
}

// ---------------------------------------------------------------------------
// assignments — the annotation kit's data access
// ---------------------------------------------------------------------------

// Queue lists one user's assignments for a task, in queue order.
func (d *DB) Queue(ctx context.Context, taskID, userID int64) ([]QueueEntry, error) {
	rows, err := d.sql.QueryContext(ctx,
		`SELECT a.id, d.name, a."order", a.status
		 FROM assignments a JOIN documents d ON d.id = a.document_id
		 WHERE a.task_id = ? AND a.user_id = ?
		 ORDER BY a."order"`, taskID, userID)
	if err != nil {
		return nil, fmt.Errorf("reading queue: %w", err)
	}
	defer rows.Close()

	queue := []QueueEntry{}
	for rows.Next() {
		var e QueueEntry
		if err := rows.Scan(&e.AssignmentID, &e.Name, &e.Order, &e.Status); err != nil {
			return nil, fmt.Errorf("reading queue entry: %w", err)
		}
		queue = append(queue, e)
	}
	return queue, rows.Err()
}

// Bundle loads one queue position: the document and everything on it.
func (d *DB) Bundle(ctx context.Context, assignmentID int64) (Bundle, error) {
	var b Bundle
	err := d.sql.QueryRowContext(ctx,
		`SELECT d.id, d.name, d.full_text, a.id, a.user_id, a."order", a.status, a.confidence
		 FROM assignments a JOIN documents d ON d.id = a.document_id
		 WHERE a.id = ?`, assignmentID,
	).Scan(&b.Document.ID, &b.Document.Name, &b.Document.FullText,
		&b.Assignment.ID, &b.Assignment.Annotator, &b.Assignment.Order,
		&b.Assignment.Status, &b.Assignment.Confidence)
	if errors.Is(err, sql.ErrNoRows) {
		return b, ErrNotFound
	}
	if err != nil {
		return b, fmt.Errorf("reading assignment: %w", err)
	}

	if b.Assignment.Annotations, err = d.spans(ctx, assignmentID); err != nil {
		return b, err
	}
	if b.Assignment.DocumentAnnotations, err = d.documentTags(ctx, assignmentID); err != nil {
		return b, err
	}
	if b.Assignment.DocumentRelations, err = d.documentRelations(ctx, assignmentID); err != nil {
		return b, err
	}
	return b, nil
}

func (d *DB) spans(ctx context.Context, assignmentID int64) ([]SpanAnnotation, error) {
	rows, err := d.sql.QueryContext(ctx,
		`SELECT id, label, "start", "end", text, confidence, metadata
		 FROM span_annotations WHERE assignment_id = ? ORDER BY "start", id`, assignmentID)
	if err != nil {
		return nil, fmt.Errorf("reading annotations: %w", err)
	}
	defer rows.Close()

	spans := []SpanAnnotation{}
	byID := map[int64]int{}
	for rows.Next() {
		var s SpanAnnotation
		if err := rows.Scan(&s.ID, &s.Label, &s.Start, &s.End, &s.Text, &s.Confidence, &s.Metadata); err != nil {
			return nil, fmt.Errorf("reading annotation: %w", err)
		}
		s.Relations = []Relation{}
		byID[s.ID] = len(spans)
		spans = append(spans, s)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(spans) == 0 {
		return spans, nil
	}

	// Relations are stored as rows but the annotation kit expects them nested
	// under the span that owns them.
	relRows, err := d.sql.QueryContext(ctx,
		`SELECT r.from_span_id, r.to_span_id, r.direction, r.labels
		 FROM span_relations r
		 JOIN span_annotations s ON s.id = r.from_span_id
		 WHERE s.assignment_id = ?`, assignmentID)
	if err != nil {
		return nil, fmt.Errorf("reading relations: %w", err)
	}
	defer relRows.Close()

	for relRows.Next() {
		var fromID int64
		var rel Relation
		var labelsJSON string
		if err := relRows.Scan(&fromID, &rel.To, &rel.Direction, &labelsJSON); err != nil {
			return nil, fmt.Errorf("reading relation: %w", err)
		}
		if err := json.Unmarshal([]byte(labelsJSON), &rel.Labels); err != nil {
			rel.Labels = []string{}
		}
		if i, ok := byID[fromID]; ok {
			spans[i].Relations = append(spans[i].Relations, rel)
		}
	}
	return spans, relRows.Err()
}

func (d *DB) documentTags(ctx context.Context, assignmentID int64) ([]DocumentAnnotation, error) {
	rows, err := d.sql.QueryContext(ctx,
		`SELECT id, label, confidence FROM document_annotations
		 WHERE assignment_id = ? ORDER BY id`, assignmentID)
	if err != nil {
		return nil, fmt.Errorf("reading document annotations: %w", err)
	}
	defer rows.Close()

	tags := []DocumentAnnotation{}
	for rows.Next() {
		var t DocumentAnnotation
		if err := rows.Scan(&t.ID, &t.Label, &t.Confidence); err != nil {
			return nil, fmt.Errorf("reading document annotation: %w", err)
		}
		tags = append(tags, t)
	}
	return tags, rows.Err()
}

// documentRelations resolves the stored assignment-to-assignment links back
// into the "target document name" form the annotation kit works in.
func (d *DB) documentRelations(ctx context.Context, assignmentID int64) ([]DocumentRelation, error) {
	rows, err := d.sql.QueryContext(ctx,
		`SELECT d.name, r.labels
		 FROM document_relations r
		 JOIN assignments a ON a.id = r.to_assignment_id
		 JOIN documents d ON d.id = a.document_id
		 WHERE r.from_assignment_id = ?`, assignmentID)
	if err != nil {
		return nil, fmt.Errorf("reading document relations: %w", err)
	}
	defer rows.Close()

	rels := []DocumentRelation{}
	for rows.Next() {
		var rel DocumentRelation
		var labelsJSON string
		if err := rows.Scan(&rel.To, &labelsJSON); err != nil {
			return nil, fmt.Errorf("reading document relation: %w", err)
		}
		if err := json.Unmarshal([]byte(labelsJSON), &rel.Labels); err != nil {
			rel.Labels = []string{}
		}
		rels = append(rels, rel)
	}
	return rels, rows.Err()
}

// IncomingRelations lists other assignments' relations pointing at this one's
// document — the read-only "Linked by" view, computed rather than stored.
func (d *DB) IncomingRelations(ctx context.Context, assignmentID int64) ([]DocumentRelation, error) {
	rows, err := d.sql.QueryContext(ctx,
		`SELECT d.name, r.labels
		 FROM document_relations r
		 JOIN assignments fa ON fa.id = r.from_assignment_id
		 JOIN documents d ON d.id = fa.document_id
		 WHERE r.to_assignment_id = ?`, assignmentID)
	if err != nil {
		return nil, fmt.Errorf("reading incoming relations: %w", err)
	}
	defer rows.Close()

	rels := []DocumentRelation{}
	for rows.Next() {
		var rel DocumentRelation
		var labelsJSON string
		if err := rows.Scan(&rel.To, &labelsJSON); err != nil {
			return nil, err
		}
		if err := json.Unmarshal([]byte(labelsJSON), &rel.Labels); err != nil {
			rel.Labels = []string{}
		}
		rels = append(rels, rel)
	}
	return rels, rows.Err()
}

// SaveAssignment replaces one assignment's annotations with those given.
//
// Delete-then-insert rather than diffing: an assignment holds a handful of
// spans, the whole thing arrives at once from a component that owns the edit,
// and a diff would be more code with more ways to be subtly wrong. It runs in
// one transaction, so a failure leaves the previous state untouched.
func (d *DB) SaveAssignment(ctx context.Context, assignmentID int64, a Assignment) error {
	return d.tx(ctx, func(tx *sql.Tx) error {
		var taskID, userID int64
		err := tx.QueryRowContext(ctx,
			`SELECT task_id, user_id FROM assignments WHERE id = ?`, assignmentID).Scan(&taskID, &userID)
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("finding assignment: %w", err)
		}

		if _, err := tx.ExecContext(ctx,
			`UPDATE assignments SET status = ?, confidence = ? WHERE id = ?`,
			a.Status, a.Confidence, assignmentID); err != nil {
			return fmt.Errorf("updating assignment: %w", err)
		}

		// Spans and their relations. Relations reference spans by the ids the
		// client saw, so new ids are mapped as rows are inserted.
		if _, err := tx.ExecContext(ctx,
			`DELETE FROM span_annotations WHERE assignment_id = ?`, assignmentID); err != nil {
			return fmt.Errorf("clearing annotations: %w", err)
		}
		newID := map[int64]int64{}
		for _, s := range a.Annotations {
			res, err := tx.ExecContext(ctx,
				`INSERT INTO span_annotations
				   (assignment_id, label, "start", "end", text, confidence, metadata)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
				assignmentID, s.Label, s.Start, s.End, s.Text, s.Confidence, s.Metadata)
			if err != nil {
				return fmt.Errorf("storing annotation: %w", err)
			}
			id, err := res.LastInsertId()
			if err != nil {
				return err
			}
			newID[s.ID] = id
		}
		for _, s := range a.Annotations {
			from, ok := newID[s.ID]
			if !ok {
				continue
			}
			for _, rel := range s.Relations {
				to, ok := newID[rel.To]
				if !ok {
					// Points at a span that was deleted in this same save.
					continue
				}
				labels, err := json.Marshal(rel.Labels)
				if err != nil {
					return err
				}
				direction := rel.Direction
				if direction == "" {
					direction = "bi"
				}
				if _, err := tx.ExecContext(ctx,
					`INSERT INTO span_relations (from_span_id, to_span_id, direction, labels)
					 VALUES (?, ?, ?, ?)`,
					from, to, direction, string(labels)); err != nil {
					return fmt.Errorf("storing relation: %w", err)
				}
			}
		}

		if _, err := tx.ExecContext(ctx,
			`DELETE FROM document_annotations WHERE assignment_id = ?`, assignmentID); err != nil {
			return fmt.Errorf("clearing document annotations: %w", err)
		}
		for _, t := range a.DocumentAnnotations {
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO document_annotations (assignment_id, label, confidence)
				 VALUES (?, ?, ?)`, assignmentID, t.Label, t.Confidence); err != nil {
				return fmt.Errorf("storing document annotation: %w", err)
			}
		}

		// Document relations arrive naming a target document; they are stored
		// as a link to that document's assignment for the same user and task.
		if _, err := tx.ExecContext(ctx,
			`DELETE FROM document_relations WHERE from_assignment_id = ?`, assignmentID); err != nil {
			return fmt.Errorf("clearing document relations: %w", err)
		}
		for _, rel := range a.DocumentRelations {
			var targetID int64
			err := tx.QueryRowContext(ctx,
				`SELECT a.id FROM assignments a JOIN documents d ON d.id = a.document_id
				 WHERE a.task_id = ? AND a.user_id = ? AND d.name = ?`,
				taskID, userID, rel.To).Scan(&targetID)
			if errors.Is(err, sql.ErrNoRows) {
				// The named document is not in this user's queue; nothing to
				// point at, so the relation is dropped rather than invented.
				continue
			}
			if err != nil {
				return fmt.Errorf("finding relation target: %w", err)
			}
			if targetID == assignmentID {
				continue
			}
			labels, err := json.Marshal(rel.Labels)
			if err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx,
				`INSERT INTO document_relations (from_assignment_id, to_assignment_id, labels)
				 VALUES (?, ?, ?)`, assignmentID, targetID, string(labels)); err != nil {
				return fmt.Errorf("storing document relation: %w", err)
			}
		}
		return nil
	})
}

// ---------------------------------------------------------------------------
// metrics — the agreement module's data access
// ---------------------------------------------------------------------------

// TaskAnnotators lists the users with an assignment in a task.
func (d *DB) TaskAnnotators(ctx context.Context, taskID int64) ([]string, error) {
	rows, err := d.sql.QueryContext(ctx,
		`SELECT DISTINCT a.user_id FROM assignments a WHERE a.task_id = ? ORDER BY a.user_id`, taskID)
	if err != nil {
		return nil, fmt.Errorf("listing annotators: %w", err)
	}
	defer rows.Close()

	out := []string{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, strconv.FormatInt(id, 10))
	}
	return out, rows.Err()
}

// TaskDocuments lists a task's documents in queue order.
func (d *DB) TaskDocuments(ctx context.Context, taskID int64) ([]Document, error) {
	rows, err := d.sql.QueryContext(ctx,
		`SELECT DISTINCT d.id, d.name, d.full_text
		 FROM documents d JOIN assignments a ON a.document_id = d.id
		 WHERE a.task_id = ? ORDER BY d.name`, taskID)
	if err != nil {
		return nil, fmt.Errorf("listing task documents: %w", err)
	}
	defer rows.Close()

	docs := []Document{}
	for rows.Next() {
		var doc Document
		if err := rows.Scan(&doc.ID, &doc.Name, &doc.FullText); err != nil {
			return nil, err
		}
		docs = append(docs, doc)
	}
	return docs, rows.Err()
}

// AnnotationFilters narrows the browsable annotation list. An empty list for a
// field means "no filter on it".
type AnnotationFilters struct {
	Labels     []string
	Documents  []string
	Annotators []string
}

// Annotations returns a task's spans, filtered, flattened with the context the
// metrics module displays. This is the query the old implementation could only
// do by loading the entire task into the browser and filtering it there.
func (d *DB) Annotations(ctx context.Context, taskID int64, f AnnotationFilters) ([]RichAnnotation, error) {
	query := strings.Builder{}
	query.WriteString(
		`SELECT s.id, s."start", s."end", s.text, s.label, s.confidence, s.metadata,
		        a.user_id, d.name
		 FROM span_annotations s
		 JOIN assignments a ON a.id = s.assignment_id
		 JOIN documents d ON d.id = a.document_id
		 WHERE a.task_id = ?`)
	args := []any{taskID}

	appendIn := func(column string, values []string) {
		if len(values) == 0 {
			return
		}
		query.WriteString(" AND " + column + " IN (")
		for i, v := range values {
			if i > 0 {
				query.WriteString(", ")
			}
			query.WriteString("?")
			args = append(args, v)
		}
		query.WriteString(")")
	}
	appendIn("s.label", f.Labels)
	appendIn("d.name", f.Documents)
	appendIn("CAST(a.user_id AS TEXT)", f.Annotators)
	query.WriteString(` ORDER BY d.name, s."start", s.id`)

	rows, err := d.sql.QueryContext(ctx, query.String(), args...)
	if err != nil {
		return nil, fmt.Errorf("reading annotations: %w", err)
	}
	defer rows.Close()

	out := []RichAnnotation{}
	for rows.Next() {
		var r RichAnnotation
		var userID int64
		if err := rows.Scan(&r.AnnID, &r.Start, &r.End, &r.Text, &r.Label,
			&r.Confidence, &r.Metadata, &userID, &r.DocName); err != nil {
			return nil, fmt.Errorf("reading annotation: %w", err)
		}
		r.Annotator = strconv.FormatInt(userID, 10)
		r.DocID = r.DocName
		out = append(out, r)
	}
	return out, rows.Err()
}

// IaaInput assembles the whole task in the shape the IAA service expects.
//
// Document-level tasks contribute their document annotations as zero-extent
// spans, which is the encoding the service already understands: it compares
// label presence per document and ignores the offsets.
func (d *DB) IaaInput(ctx context.Context, taskID int64) (IaaInput, error) {
	var in IaaInput
	in.Documents = []IaaDocument{}
	in.Labelset.Labels = []IaaLabel{}

	task, err := d.Task(ctx, taskID)
	if err != nil {
		return in, err
	}
	for _, l := range task.Labelset.Labels {
		in.Labelset.Labels = append(in.Labelset.Labels, IaaLabel{Name: l.Name})
	}
	if task.AnnotationLevel == "document" {
		in.AnnotationLevel = "document"
	}

	docs, err := d.TaskDocuments(ctx, taskID)
	if err != nil {
		return in, err
	}

	for _, doc := range docs {
		out := IaaDocument{Name: doc.Name, FullText: doc.FullText, Assignments: []IaaAssignment{}}

		rows, err := d.sql.QueryContext(ctx,
			`SELECT a.id, a.user_id, a.confidence FROM assignments a
			 WHERE a.task_id = ? AND a.document_id = ? ORDER BY a.user_id`, taskID, doc.ID)
		if err != nil {
			return in, fmt.Errorf("reading assignments: %w", err)
		}
		type asgn struct {
			id, user int64
			conf     int
		}
		var asgns []asgn
		for rows.Next() {
			var a asgn
			if err := rows.Scan(&a.id, &a.user, &a.conf); err != nil {
				rows.Close()
				return in, err
			}
			asgns = append(asgns, a)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return in, err
		}

		for _, a := range asgns {
			entry := IaaAssignment{
				Annotator:        strconv.FormatInt(a.user, 10),
				DifficultyRating: a.conf,
				Annotations:      []IaaAnnotation{},
			}

			if task.AnnotationLevel == "document" {
				tags, err := d.documentTags(ctx, a.id)
				if err != nil {
					return in, err
				}
				for _, t := range tags {
					entry.Annotations = append(entry.Annotations,
						IaaAnnotation{Label: t.Label})
				}
			} else {
				spans, err := d.spans(ctx, a.id)
				if err != nil {
					return in, err
				}
				for _, s := range spans {
					entry.Annotations = append(entry.Annotations, IaaAnnotation{
						Start: s.Start, End: s.End, Label: s.Label, Text: s.Text,
					})
				}
			}
			out.Assignments = append(out.Assignments, entry)
		}
		in.Documents = append(in.Documents, out)
	}
	return in, nil
}
