export type RequiredField = {
  id: string;
  label: string;
  required: boolean;
  hint?: string;
  synonyms?: string[];
};

export const normalizeText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .trim();

const scoreColumnMatch = (normalizedColumn: string, keywords: string[]): number => {
  return keywords.reduce((score, keyword) => {
    if (normalizedColumn === keyword) return score + 2;
    if (normalizedColumn.includes(keyword)) return score + 1;
    return score;
  }, 0);
};

export const computeColumnGuesses = (
  requiredFields: RequiredField[],
  normalizedColumns: Array<{ original: string; normalized: string }>,
  fieldKeywords: Record<string, string[]>,
  priorityOrder: string[] = [],
) => {
  type Candidate = { fieldId: string; column: string; score: number };
  const candidates: Candidate[] = [];

  const priorityMap = priorityOrder.reduce<Record<string, number>>((acc, fieldId, index) => {
    acc[fieldId] = index;
    return acc;
  }, {});

  normalizedColumns.forEach((column) => {
    requiredFields.forEach((field) => {
      const keywords = fieldKeywords[field.id] ?? [];
      const score = scoreColumnMatch(column.normalized, keywords);
      if (score > 0) {
        candidates.push({ fieldId: field.id, column: column.original, score });
      }
    });
  });

  const usedColumns = new Set<string>();
  const assignment = new Map<string, string>();

  candidates
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;

      const aPriority = priorityMap[a.fieldId] ?? Number.MAX_SAFE_INTEGER;
      const bPriority = priorityMap[b.fieldId] ?? Number.MAX_SAFE_INTEGER;
      if (aPriority !== bPriority) return aPriority - bPriority;

      return a.fieldId.localeCompare(b.fieldId);
    })
    .forEach((candidate) => {
      if (assignment.has(candidate.fieldId)) return;
      if (usedColumns.has(candidate.column)) return;

      assignment.set(candidate.fieldId, candidate.column);
      usedColumns.add(candidate.column);
    });

  return requiredFields.reduce<Record<string, string | null>>((acc, field) => {
    acc[field.id] = assignment.get(field.id) ?? null;
    return acc;
  }, {});
};
