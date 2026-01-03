import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  AssignmentEngine,
  AssignmentJob,
  TechnicianProfile,
  deterministicFallback,
  filterCandidates,
} from "./assignment";

const directory: TechnicianProfile[] = [
  {
    id: "ana",
    name: "Ana",
    document: "123",
    regions: ["metro"],
    skills: ["post-service", "batch-handling"],
    availability: "ONLINE",
    workload: 1,
    maxWorkload: 5,
    projects: ["project-1"],
    tier: "L2",
  },
  {
    id: "bruno",
    name: "Bruno",
    document: "456",
    regions: ["sur"],
    skills: ["post-service"],
    availability: "BUSY",
    workload: 4,
    maxWorkload: 4,
    projects: ["project-1", "project-2"],
    tier: "L1",
  },
  {
    id: "camila",
    name: "Camila",
    document: "789",
    regions: ["metro"],
    skills: ["batch-handling"],
    availability: "ONLINE",
    workload: 3,
    maxWorkload: 6,
    projects: ["project-2"],
    tier: "L3",
  },
];

const job: AssignmentJob = {
  ticketId: "ticket-1",
  projectId: "project-1",
  requiredSkills: ["post-service"],
  priority: "P2",
  requestedAt: new Date(),
};

describe("filterCandidates", () => {
  it("applies hard rules before delegating to el ranker ML", () => {
    const filtered = filterCandidates({ ...job, region: "metro" }, directory);

    expect(filtered.map((candidate) => candidate.id)).toEqual(["ana"]);
  });
});

describe("AssignmentEngine", () => {
  let engine: AssignmentEngine;

  beforeEach(() => {
    engine = new AssignmentEngine(directory, { batchSize: 5, flushIntervalMs: 0 });
  });

  afterEach(() => {
    engine.stop();
    vi.useRealTimers();
  });

  it("usa un fallback determinístico cuando el ranker ML falla", async () => {
    const throwingRanker = vi.fn(async () => {
      throw new Error("ml down");
    });
    engine = new AssignmentEngine(directory, {
      batchSize: 2,
      flushIntervalMs: 0,
      ranker: throwingRanker,
      fallbackSelector: deterministicFallback,
    });

    engine.enqueue(job);
    const [decision] = await engine.flushPending();

    expect(decision.strategy).toBe("deterministic-fallback");
    expect(decision.technicianId).toBe("ana");
    expect(engine.getMetrics().mlFailures).toBe(1);
    expect(engine.getMetrics().fallbackDecisions).toBe(1);
  });

  it("procesa lotes en segundo plano sin bloquear el backend principal", async () => {
    vi.useFakeTimers();
    engine = new AssignmentEngine(directory, { batchSize: 10, flushIntervalMs: 50 });

    engine.enqueue(job);
    engine.enqueue({ ...job, ticketId: "ticket-2", priority: "P1" });
    engine.enqueue({ ...job, ticketId: "ticket-3", projectId: "project-2", requiredSkills: ["batch-handling"] });

    expect(engine.getMetrics().processed).toBe(0);

    await vi.advanceTimersByTimeAsync(60);

    const metrics = engine.getMetrics();
    expect(metrics.processed).toBe(3);
    expect(metrics.lastBatchSize).toBe(3);
    expect(metrics.queueDepth).toBe(0);
  });
});
