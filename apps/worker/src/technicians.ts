import { TechnicianAssignmentMatch } from "@shared/types";

interface TechnicianDirectoryEntry {
  id: string;
  name: string;
  document: string;
}

const TECHNICIAN_DIRECTORY: TechnicianDirectoryEntry[] = [
  { id: "tech-ana", name: "Ana Pérez", document: "12.345.678-9" },
  { id: "tech-bruno", name: "Bruno Díaz", document: "9.876.543-2" },
  { id: "tech-camila", name: "Camila Soto", document: "22.111.333-4" },
];

export function normalizeDocumentId(value: string): string {
  return value.replace(/[\s.-]/g, "").toLowerCase();
}

export function buildDirectoryMatches(identityField: string): TechnicianAssignmentMatch[] {
  return TECHNICIAN_DIRECTORY.map((technician) => ({
    document: technician.document,
    technician_id: technician.id,
    technician_name: technician.name,
    confidence: 0.78,
    rationale: `Las filas donde "${identityField}" coincida con ${technician.document} se asignarán a ${technician.name}.`,
  }));
}
