package db

// The wire shapes the frontend sees. Field names match the packages' own
// types, so the runtime's Source implementations hand values straight to the
// components without a rename in between.

// User is one person working in the platform.
type User struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
	Role  string `json:"role"`
}

// Label is one entry of a labelset.
type Label struct {
	Name  string `json:"name"`
	Color string `json:"color"`
}

// Labelset is a named set of labels, as legal-annotation-kit expects it.
type Labelset struct {
	Name   string  `json:"name"`
	Desc   string  `json:"desc"`
	Labels []Label `json:"labels"`
}

// Task is an annotation task with its labelset resolved.
type Task struct {
	ID              int64    `json:"id"`
	Name            string   `json:"name"`
	Desc            string   `json:"desc"`
	AnnGuidelines   string   `json:"ann_guidelines"`
	AnnotationLevel string   `json:"annotation_level"`
	Labelset        Labelset `json:"labelset"`
}

// Document is one text under annotation.
type Document struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	// Where it came from — a filename, an ECLI, a URL. Defaults to the name
	// when whoever imported it had nothing better to say.
	Source   string `json:"source,omitempty"`
	FullText string `json:"full_text"`
}

// SpanAnnotation is a labelled stretch of text. Relations are nested the way
// legal-annotation-kit expects them, even though they are stored as rows.
type SpanAnnotation struct {
	ID         int64      `json:"id"`
	Start      int        `json:"start"`
	End        int        `json:"end"`
	Label      string     `json:"label"`
	Text       string     `json:"text"`
	Confidence int        `json:"confidence"`
	Metadata   *string    `json:"metadata"`
	Relations  []Relation `json:"relations"`
}

// Relation is a directed link to another span, by span id.
type Relation struct {
	To        int64    `json:"to"`
	Direction string   `json:"direction"`
	Labels    []string `json:"labels"`
}

// DocumentAnnotation is a label applied to a whole document.
type DocumentAnnotation struct {
	ID         int64  `json:"id"`
	Label      string `json:"label"`
	Confidence int    `json:"confidence"`
}

// DocumentRelation names its target by document name, which is what the
// annotation kit works in. The store keeps it as a link between two
// assignments; the translation happens here and nowhere else.
type DocumentRelation struct {
	To     string   `json:"to"`
	Labels []string `json:"labels"`
}

// Assignment is one user's work on one document within a task.
type Assignment struct {
	ID                  int64                `json:"id"`
	Annotator           int64                `json:"annotator"`
	Order               int                  `json:"order"`
	Status              string               `json:"status"`
	Confidence          int                  `json:"confidence"`
	Annotations         []SpanAnnotation     `json:"annotations"`
	DocumentAnnotations []DocumentAnnotation `json:"document_annotations"`
	DocumentRelations   []DocumentRelation   `json:"document_relations"`
}

// Bundle is one queue position: the document and the assignment on it.
type Bundle struct {
	Document   Document   `json:"document"`
	Assignment Assignment `json:"assignment"`
}

// QueueEntry is a lightweight queue listing, enough to populate a document
// picker without loading any full text or annotations.
type QueueEntry struct {
	AssignmentID int64  `json:"assignment_id"`
	Name         string `json:"name"`
	Order        int    `json:"order"`
	Status       string `json:"status"`
}

// RichAnnotation is one span flattened with the context the metrics module
// shows alongside it.
type RichAnnotation struct {
	Start      int     `json:"start"`
	End        int     `json:"end"`
	Text       string  `json:"text"`
	Label      string  `json:"label"`
	Annotator  string  `json:"annotator"`
	AnnID      int64   `json:"ann_id"`
	DocID      string  `json:"doc_id"`
	DocName    string  `json:"doc_name"`
	Confidence int     `json:"confidence"`
	Metadata   *string `json:"metadata,omitempty"`
}

// TaskConfig is what the annotate step's settings say a task should look like.
type TaskConfig struct {
	Name            string   `json:"name"`
	Guidelines      string   `json:"guidelines"`
	AnnotationLevel string   `json:"annotation_level"`
	Labels          []string `json:"labels"`
	Annotators      int      `json:"annotators"`
}

// IAA request shapes. The IAA service has its own vocabulary — annotator ids
// are strings and document confidence is difficulty_rating — and this is the
// one place those names appear.

type IaaAnnotation struct {
	Start int    `json:"start"`
	End   int    `json:"end"`
	Label string `json:"label"`
	Text  string `json:"text"`
}

type IaaAssignment struct {
	Annotator        string          `json:"annotator"`
	DifficultyRating int             `json:"difficulty_rating"`
	Annotations      []IaaAnnotation `json:"annotations"`
}

type IaaDocument struct {
	Name        string          `json:"name"`
	FullText    string          `json:"full_text"`
	Assignments []IaaAssignment `json:"assignments"`
}

type IaaLabel struct {
	Name string `json:"name"`
}

type IaaInput struct {
	Labelset struct {
		Labels []IaaLabel `json:"labels"`
	} `json:"labelset"`
	Documents       []IaaDocument `json:"documents"`
	AnnotationLevel string        `json:"annotation_level,omitempty"`
}
