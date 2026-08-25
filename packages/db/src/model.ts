// The wire shapes the frontend sees.
//
// Field names match the packages' own types, so the runtime's source
// implementations hand values straight to the components without a rename in
// between. Where Lawnotation and the packages disagree, the packages win:
// `confidence` not `difficulty_rating`, `order` not `seq_pos`, `start`/`end`
// not `start_index`/`end_index`.

/** One person working in the platform. */
export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

/** One entry of a labelset. */
export interface Label {
  name: string;
  color: string;
}

/** A named set of labels, as legal-annotation-kit expects it. */
export interface Labelset {
  name: string;
  desc: string;
  labels: Label[];
}

/** An annotation task with its labelset resolved. */
export interface Task {
  id: number;
  name: string;
  desc: string;
  ann_guidelines: string;
  annotation_level: string;
  labelset: Labelset;
}

/** One text under annotation. */
export interface Document {
  id: number;
  name: string;
  /**
   * Where it came from — a filename, an ECLI, a URL. Defaults to the name when
   * whoever imported it had nothing better to say.
   */
  source?: string;
  full_text: string;
}

/** A directed link to another span, by span id. */
export interface Relation {
  to: number;
  direction: string;
  labels: string[];
}

/**
 * A labelled stretch of text. Relations are nested the way
 * legal-annotation-kit expects them, even though they are stored as rows.
 */
export interface SpanAnnotation {
  id: number;
  start: number;
  end: number;
  label: string;
  text: string;
  confidence: number;
  metadata: string | null;
  relations: Relation[];
}

/** A label applied to a whole document. */
export interface DocumentAnnotation {
  id: number;
  label: string;
  confidence: number;
}

/**
 * Names its target by document name, which is what the annotation kit works
 * in. The store keeps it as a link between two assignments; the translation
 * happens at the edge and nowhere else.
 */
export interface DocumentRelation {
  to: string;
  labels: string[];
}

/** One user's work on one document within a task. */
export interface Assignment {
  id: number;
  annotator: number;
  order: number;
  status: string;
  confidence: number;
  annotations: SpanAnnotation[];
  document_annotations: DocumentAnnotation[];
  document_relations: DocumentRelation[];
}

/** One queue position: the document and the assignment on it. */
export interface Bundle {
  document: Document;
  assignment: Assignment;
}

/**
 * A lightweight queue listing, enough to populate a document picker without
 * loading any full text or annotations.
 */
export interface QueueEntry {
  assignment_id: number;
  name: string;
  order: number;
  status: string;
}

/** One annotation flattened with the context the metrics module shows. */
export interface RichAnnotation {
  start: number;
  end: number;
  text: string;
  label: string;
  annotator: string;
  ann_id: number;
  doc_id: string;
  doc_name: string;
  confidence: number;
  metadata?: string | null;
}

/** What the annotate step's settings say a task should look like. */
export interface TaskConfig {
  name: string;
  guidelines: string;
  annotation_level: string;
  labels: string[];
  annotators: number;
}

// IAA request shapes. The IAA service has its own vocabulary — annotator ids
// are strings and document confidence is difficulty_rating — and this is the
// one place those names appear.

export interface IaaAnnotation {
  start: number;
  end: number;
  label: string;
  text: string;
}

export interface IaaAssignment {
  annotator: string;
  difficulty_rating: number;
  annotations: IaaAnnotation[];
}

export interface IaaDocument {
  name: string;
  full_text: string;
  assignments: IaaAssignment[];
}

export interface IaaInput {
  labelset: { labels: { name: string }[] };
  documents: IaaDocument[];
  annotation_level?: string;
}

/** Narrows the browsable annotation list. An empty list means "no filter". */
export interface AnnotationFilters {
  labels?: string[];
  documents?: string[];
  annotators?: string[];
}
