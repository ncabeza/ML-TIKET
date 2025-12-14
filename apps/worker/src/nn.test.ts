import { describe, expect, it } from "vitest";
import { inferFieldType, scoreFieldTypes } from "./nn";

describe("inferFieldType", () => {
  it("prioritizes specialized detection for photo columns", () => {
    const result = inferFieldType("Foto del equipo");

    expect(result.type).toBe("photo");
    expect(result.confidence).toBeGreaterThan(0.8);
  });

  it("uses the neural scoring when there is no specialized match", () => {
    const result = inferFieldType("Fecha de visita");

    expect(result.type).toBe("date");
    expect(result.confidence).toBeGreaterThan(0);
  });
});

describe("scoreFieldTypes", () => {
  it("returns probability scores for each field type", () => {
    const scores = scoreFieldTypes("direccion cliente");

    expect(scores).toHaveLength(6);
    const best = scores.reduce((top, current) =>
      current.score > top.score ? current : top,
    );

    expect(best.type).toBeDefined();
    expect(best.score).toBeGreaterThan(0);
  });
});
