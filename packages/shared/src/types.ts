export type ImportMode = "POST_SERVICE" | "MASS_CREATE";

export interface ImportJob {
  _id: string;
  project_id: string;
  created_by: string;
  mode: ImportMode;
  status: "PENDING" | "PREVIEW_READY" | "AWAITING_TEMPLATE_CONFIRMATION" | "READY_TO_RUN" | "RUNNING" | "COMPLETED" | "FAILED";
  upload: {
    filename: string;
    mimeType: string;
    size: number;
    storageKey: string;
  };
  structural_artifact_id?: string;
  column_mapping?: Record<string, string>;
  template_resolution?: TemplateResolution;
  ml_insights?: MLInsights;
  stats?: JobStats;
  errors_ref?: string;
  created_at: string;
  updated_at: string;
}

export interface TemplateResolution {
  template_id?: string;
  template_version_id?: string;
  similarity?: number;
  proposed_new_template?: boolean;
  rationale?: string;
}

export interface MLInsights {
  structure_confidence?: number;
  template_similarity_scores?: Array<{
    template_id: string;
    template_version_id: string;
    score: number;
  }>;
  inferred_field_types?: Record<string, { type: FieldType; confidence: number }>;
  missingness_profile?: MissingnessProfile;
  technician_assignment?: TechnicianAssignmentInsight;
  normalized_preview?: Record<string, unknown[]>;
  normalization_metadata?: Record<string, { total_rows: number; truncated: boolean }>;
}

export interface DiagnosticIssue {
  level: "error" | "warning";
  code: string;
  message: string;
  recommendation?: string;
}

export interface JobDiagnostics {
  job_id: string;
  ready_to_run: boolean;
  issues: DiagnosticIssue[];
}

export type FieldType =
  | "number"
  | "text"
  | "date"
  | "boolean"
  | "address"
  | "photo"
  | "select"
  | "multiselect";

export interface MissingnessProfile {
  signal: "MCAR" | "MAR" | "MNAR";
  confidence: number;
  imputation_permitted: boolean;
  blockers?: string[];
}

export interface TechnicianAssignmentMatch {
  document: string;
  technician_id?: string;
  technician_name?: string;
  confidence: number;
  rationale: string;
}

export interface TechnicianAssignmentInsight {
  identityField?: string;
  matches: TechnicianAssignmentMatch[];
  policy: "AUTO_ASSIGN" | "REVIEW";
  notes: string[];
}

export interface JobStats {
  detected_rows: number;
  detected_tables: number;
  columns: number;
  estimated_tickets: number;
}

export interface ImportArtifact {
  _id: string;
  job_id: string;
  struct_tree: StructuredTreeNode[];
  detected_tables: DetectedTable[];
  anchors: Anchor[];
  formula_index: FormulaIndexEntry[];
  format_groups: FormatGroup[];
  compressed_representation: CompressedSheet;
}

export interface StructuredTreeNode {
  id: string;
  label: string;
  depth: number;
  range: CellRange;
  children?: StructuredTreeNode[];
}

export interface CellRange {
  start: string; // Excel A1 notation
  end: string;
}

export interface DetectedTable {
  id: string;
  headerRange: CellRange;
  dataRange: CellRange;
  columns: DetectedColumn[];
}

export interface DetectedColumn {
  name: string;
  range: CellRange;
  inferredType?: FieldType;
  confidence?: number;
}

export interface Anchor {
  label: string;
  cell: string;
}

export interface FormulaIndexEntry {
  formula: string;
  occurrences: string[];
}

export interface FormatGroup {
  format: string;
  cells: string[];
}

export interface CompressedSheet {
  anchorHash: string;
  formulaFingerprint: string;
  formatClusters: Record<string, string[]>;
}

export interface TemplateMatch {
  template_id: string;
  template_version_id: string;
  score: number;
}

export interface TemplateSuggestionResult {
  strongMatch?: TemplateMatch;
  suggestions: TemplateMatch[];
  proposeNewTemplate: boolean;
  rationale: string;
  repeatUploadHint?: RepeatUploadHint;
  technicianSummary: string;
  nextSteps?: string[];
}

export interface RepeatUploadHint {
  fingerprint: string;
  confirmedDateColumns: string[];
  requiredPrompts: string[];
  templateExistsOnPlatform: boolean;
  note: string;
}

export interface ColumnClassification {
  column: string;
  type: FieldType;
  confidence: number;
  evidence: string[];
}

export interface MissingnessDetectionResult {
  profile: MissingnessProfile;
  notes: string[];
}

export interface PreviewPayload {
  job: ImportJob;
  artifact: ImportArtifact;
  classifications: ColumnClassification[];
  templateSuggestion: TemplateSuggestionResult;
  missingness: MissingnessDetectionResult;
  technicianAssignment: TechnicianAssignmentInsight;
}

