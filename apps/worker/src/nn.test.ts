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

  it("keeps producing stable scores for noisy, long column names", () => {
    const longName =
      "FOTO_del_equipo___HTTP://example.com/image.PNG !!! historial de casos con comentarios y metadata redundante";

    const result = inferFieldType(longName);

    expect(result.type).toBe("photo");
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.evidence.some((line) => line.toLowerCase().includes("token"))).toBe(true);
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

  it("never produces NaN or infinities even with extremely verbose headers", () => {
    const scores = scoreFieldTypes(
      "|".repeat(50) +
        " Inventario mensual consolidado con 2024-08-01 y 10.000 referencias y ciudades y direcciones y costos"
    );

    const total = scores.reduce((sum, current) => sum + current.score, 0);

    expect(scores.every((entry) => Number.isFinite(entry.score))).toBe(true);
    expect(total).toBeCloseTo(1, 5);
  });
});
