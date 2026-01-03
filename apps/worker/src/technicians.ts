import { TechnicianAssignmentMatch } from "@shared/types";

export interface TechnicianDirectoryEntry {
  id: string;
  name: string;
  document: string;
  regions: string[];
  skills: string[];
  availability: "ONLINE" | "OFFLINE" | "BUSY";
  workload: number;
  maxWorkload: number;
  projects: string[];
  tier: "L1" | "L2" | "L3";
}

const TECHNICIAN_DIRECTORY: TechnicianDirectoryEntry[] = [
  {
    id: "tech-ana",
    name: "Ana Pérez",
    document: "12.345.678-9",
    regions: ["norte", "metro"],
    skills: ["post-service", "batch-handling", "install"],
    availability: "ONLINE",
    workload: 3,
    maxWorkload: 8,
    projects: ["project-1", "project-2"],
    tier: "L2",
  },
  {
    id: "tech-bruno",
    name: "Bruno Díaz",
    document: "9.876.543-2",
    regions: ["sur"],
    skills: ["post-service"],
    availability: "BUSY",
    workload: 5,
    maxWorkload: 6,
    projects: ["project-1"],
    tier: "L1",
  },
  {
    id: "tech-camila",
    name: "Camila Soto",
    document: "22.111.333-4",
    regions: ["metro"],
    skills: ["batch-handling", "install"],
    availability: "ONLINE",
    workload: 2,
    maxWorkload: 5,
    projects: ["project-2", "project-3"],
    tier: "L3",
  },
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

export function technicianDirectory(): TechnicianDirectoryEntry[] {
  return [...TECHNICIAN_DIRECTORY];
}
