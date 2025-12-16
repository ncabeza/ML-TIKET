import { describe, expect, it } from "vitest";
import { computeColumnGuesses, normalizeText, RequiredField } from "./mappingUtils";

const buildKeywords = (fields: RequiredField[]) => {
  const keywords: Record<string, string[]> = {};
  fields.forEach((field) => {
    keywords[field.id] = [field.label, ...(field.synonyms ?? [])].map(normalizeText);
  });
  return keywords;
};

const normalizeColumns = (columns: string[]) =>
  columns.map((column) => ({ original: column, normalized: normalizeText(column) }));

const priorityOrder = ["direccion", "cliente"];

describe("computeColumnGuesses", () => {
  const requiredFields: RequiredField[] = [
    {
      id: "cliente",
      label: "Cliente",
      required: true,
      synonyms: ["cliente final", "razon social"],
    },
    {
      id: "direccion",
      label: "Dirección",
      required: true,
      synonyms: ["direccion cliente", "ubicacion"],
    },
  ];

  it("maps cliente and direccion to different columns when both are available", () => {
    const fieldKeywords = buildKeywords(requiredFields);
    const normalizedColumns = normalizeColumns(["Cliente", "Direccion Cliente"]);

    const guesses = computeColumnGuesses(
      requiredFields,
      normalizedColumns,
      fieldKeywords,
      priorityOrder,
    );

    expect(guesses.cliente).toBe("Cliente");
    expect(guesses.direccion).toBe("Direccion Cliente");
  });

  it("avoids duplicating a single column when direccion has the stronger match", () => {
    const fieldKeywords = buildKeywords(requiredFields);
    const normalizedColumns = normalizeColumns(["Direccion Cliente"]);

    const guesses = computeColumnGuesses(
      requiredFields,
      normalizedColumns,
      fieldKeywords,
      priorityOrder,
    );

    expect(guesses.direccion).toBe("Direccion Cliente");
    expect(guesses.cliente).toBeNull();
  });

  it("prefers reusing the direccion column when matches are tied", () => {
    const fieldKeywords = buildKeywords(requiredFields);
    const normalizedColumns = normalizeColumns(["Ubicacion Cliente"]);

    const guesses = computeColumnGuesses(
      requiredFields,
      normalizedColumns,
      fieldKeywords,
      priorityOrder,
    );

    expect(guesses.direccion).toBe("Ubicacion Cliente");
    expect(guesses.cliente).toBeNull();
  });
});
