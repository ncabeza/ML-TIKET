import { FieldType } from "@shared/types";

// Minimal deterministic MLP to mimic a lightweight neural network classifier
// for column semantics. The weights are hand-tuned to reward intuitive
// vocabulary (e.g., date-like tokens push the date neuron) while keeping the
// implementation dependency-free.

interface NetworkWeights {
  W1: number[][];
  b1: number[];
  W2: number[][];
  b2: number[];
}

const FEATURE_NAMES = [
  "dateSignal",
  "currencySignal",
  "identitySignal",
  "countSignal",
  "locationSignal",
  "booleanSignal",
  "textSignal",
  "lengthPenalty",
] as const;

type FeatureVector = Record<(typeof FEATURE_NAMES)[number], number>;

const NETWORK: NetworkWeights = {
  // 8 input features → 5 hidden neurons
  W1: [
    [1.2, 0.8, 0.4, 0.1, 0.2, -0.3, 0.1, -0.1],
    [0.5, 1.1, 0.6, 0.2, 0.3, -0.1, 0.0, -0.2],
    [0.1, 0.3, 1.0, 0.5, 0.2, 0.0, 0.0, -0.1],
    [0.2, 0.2, 0.1, 1.3, 0.1, 0.1, -0.2, 0.0],
    [0.1, 0.1, 0.0, 0.0, 1.1, 0.4, 0.2, -0.1],
  ],
  b1: [0.2, 0.1, 0.0, 0.0, 0.1],
  // 5 hidden → 6 outputs (matches FieldType choices we expect to emit)
  W2: [
    [1.4, 0.3, 0.1, 0.1, 0.1], // date
    [0.1, 1.4, 0.2, 0.3, 0.0], // number
    [0.2, 0.2, 1.2, 0.1, 0.2], // text
    [0.1, 0.1, 0.1, 1.3, 0.0], // boolean
    [0.1, 0.2, 0.2, 0.0, 1.2], // select/multiselect
    [0.3, 0.1, 0.3, 0.0, 0.1], // fallback text-ish
  ],
  b2: [0.0, 0.1, 0.0, 0.0, 0.1, 0.0],
};

const FIELD_MAP: FieldType[] = [
  "date",
  "number",
  "text",
  "boolean",
  "select",
  "multiselect",
];

const TOKEN_LEXICON: Record<(keyof FeatureVector), string[]> = {
  dateSignal: ["fecha", "date", "dia", "mes", "año", "created", "updated"],
  currencySignal: ["monto", "importe", "total", "precio", "costo", "rate", "paid"],
  identitySignal: [
    "id",
    "uuid",
    "folio",
    "ticket",
    "reference",
    "rut",
    "dni",
    "cedula",
    "cédula",
    "documento",
  ],
  countSignal: ["cantidad", "count", "qty", "units"],
  locationSignal: ["direccion", "address", "city", "country", "postal"],
  booleanSignal: ["activo", "active", "enabled", "flag", "ok", "si", "no"],
  textSignal: ["cliente", "nombre", "descripcion", "comentario", "notas"],
  lengthPenalty: [],
};

function tokenize(name: string): string[] {
  return name
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.toLowerCase())
    .filter(Boolean);
}

function buildFeatures(column: string): FeatureVector {
  const tokens = tokenize(column);
  const featureScores = Object.fromEntries(
    FEATURE_NAMES.map((feature) => [feature, 0])
  ) as FeatureVector;

  for (const token of tokens) {
    for (const [feature, lexicon] of Object.entries(TOKEN_LEXICON)) {
      if (feature === "lengthPenalty") continue;
      if (lexicon.some((hint) => token.includes(hint))) {
        featureScores[feature as keyof FeatureVector] += 1;
      }
    }
  }

  featureScores.lengthPenalty = Math.max(0, tokens.join("").length - 18) / 10;

  return featureScores;
}

function relu(x: number): number {
  return Math.max(0, x);
}

function softmax(vec: number[]): number[] {
  const max = Math.max(...vec);
  const exps = vec.map((v) => Math.exp(v - max));
  const sum = exps.reduce((acc, v) => acc + v, 0);
  return exps.map((v) => (sum === 0 ? 0 : v / sum));
}

function matVecMul(matrix: number[][], vec: number[]): number[] {
  return matrix.map((row) => row.reduce((acc, weight, idx) => acc + weight * vec[idx], 0));
}

export function scoreFieldTypes(columnName: string): Array<{ type: FieldType; score: number }> {
  const features = buildFeatures(columnName);
  const featureArray = FEATURE_NAMES.map((name) => features[name]);

  const hidden = matVecMul(NETWORK.W1, featureArray).map((v, idx) =>
    relu(v + NETWORK.b1[idx])
  );
  const logits = matVecMul(NETWORK.W2, hidden).map((v, idx) => v + NETWORK.b2[idx]);
  const probs = softmax(logits);

  return probs.map((p, idx) => ({ type: FIELD_MAP[idx], score: Number(p.toFixed(3)) }));
}

export function inferFieldType(columnName: string): { type: FieldType; confidence: number; evidence: string[] } {
  const scores = scoreFieldTypes(columnName);
  const best = scores.reduce((top, current) => (current.score > top.score ? current : top), scores[0]);

  const evidence = [
    `MLP scores ${best.type} at ${(best.score * 100).toFixed(1)}% based on lexical cues`,
    `Tokens: ${tokenize(columnName).join(", ") || "<none>"}`,
  ];

  return { type: best.type, confidence: best.score, evidence };
}
