import { describe, expect, it } from "vitest";
import { detectMissingness, matchTemplates } from "./semantic";
import { ColumnClassification, ImportArtifact } from "@shared/types";

function buildArtifact(overrides: Partial<ImportArtifact> = {}): ImportArtifact {
  const baseTable = {
    id: "table-1",
    headerRange: { start: "A1", end: "D1" },
    dataRange: { start: "A2", end: "D10" },
    columns: [
      { name: "Fecha", range: { start: "A2", end: "A10" } },
      { name: "Cliente", range: { start: "B2", end: "B10" } },
      { name: "Monto", range: { start: "C2", end: "C10" } },
      { name: "Estado", range: { start: "D2", end: "D10" } },
    ],
  };

  return {
    _id: "artifact-1",
    job_id: "job-1",
    struct_tree: [],
    detected_tables: [baseTable],
    anchors: [{ label: "Fecha", cell: "A1" }],
    formula_index: [{ formula: "=SUM(C:C)", occurrences: ["C11"] }],
    format_groups: [{ format: "currency", cells: ["C2", "C3"] }],
    compressed_representation: {
      anchorHash: "anchor-hash",
      formulaFingerprint: "formula-fp",
      formatClusters: { currency: ["C2"] },
    },
    ...overrides,
  };
}

describe("matchTemplates", () => {
  it("promotes known fingerprints into a confident strong match", async () => {
    const artifact = buildArtifact({
      detected_tables: [
        {
          id: "table-1",
          headerRange: { start: "A1", end: "E1" },
          dataRange: { start: "A2", end: "E20" },
          columns: [
            { name: "Fecha", range: { start: "A2", end: "A20" } },
            { name: "Cliente", range: { start: "B2", end: "B20" } },
            { name: "Monto", range: { start: "C2", end: "C20" } },
            { name: "Dirección", range: { start: "D2", end: "D20" } },
            { name: "Ticket", range: { start: "E2", end: "E20" } },
          ],
        },
      ],
    });

    const classifications: ColumnClassification[] = [
      { column: "Fecha", type: "date", confidence: 0.74, evidence: [] },
      { column: "Cliente", type: "text", confidence: 0.71, evidence: [] },
      { column: "Monto", type: "number", confidence: 0.69, evidence: [] },
    ];

    const result = await matchTemplates(artifact, classifications);

    expect(result.strongMatch?.template_id).toBe("template-historic");
    expect(result.strongMatch?.score).toBeGreaterThan(0.9);
    expect(result.proposeNewTemplate).toBe(false);
    expect(result.repeatUploadHint?.fingerprint).toContain("anchor-hash");
  });
});

describe("detectMissingness", () => {
  it("lets rich structural signals enable safe imputation", async () => {
    const artifact = buildArtifact({
      detected_tables: [
        buildArtifact().detected_tables[0],
        {
          id: "table-2",
          headerRange: { start: "A1", end: "C1" },
          dataRange: { start: "A2", end: "C15" },
          columns: [
            { name: "Proyecto", range: { start: "A2", end: "A15" } },
            { name: "Estado", range: { start: "B2", end: "B15" } },
            { name: "Fecha", range: { start: "C2", end: "C15" } },
          ],
        },
      ],
      anchors: [
        { label: "Fecha", cell: "A1" },
        { label: "Cliente", cell: "B1" },
        { label: "Proyecto", cell: "C1" },
      ],
      formula_index: [
        { formula: "=SUM(C:C)", occurrences: ["C21"] },
        { formula: "=COUNT(A:A)", occurrences: ["A21"] },
      ],
      format_groups: [
        { format: "currency", cells: ["C2", "C3"] },
        { format: "date", cells: ["A2", "C2"] },
        { format: "header", cells: ["A1", "B1", "C1"] },
      ],
    });

    const result = await detectMissingness(artifact);

    expect(["MCAR", "MAR"]).toContain(result.profile.signal);
    expect(result.profile.imputation_permitted).toBe(true);
    expect(result.profile.confidence).toBeGreaterThanOrEqual(0.58);
  });

  it("flags sparse layouts as MNAR and blocks imputation", async () => {
    const artifact = buildArtifact({
      detected_tables: [],
      anchors: [],
      formula_index: [],
      format_groups: [],
      compressed_representation: {
        anchorHash: "unknown",
        formulaFingerprint: "unknown",
        formatClusters: {},
      },
    });

    const result = await detectMissingness(artifact);

    expect(result.profile.signal).toBe("MNAR");
    expect(result.profile.imputation_permitted).toBe(false);
    expect(result.profile.blockers.length).toBeGreaterThan(0);
  });
});
