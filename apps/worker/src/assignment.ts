import { ImportJob } from "@shared/types";
import EventEmitter from "events";
import { normalizeDocumentId, technicianDirectory } from "./technicians";

type Priority = "P1" | "P2" | "P3";

type TechnicianAvailability = "ONLINE" | "OFFLINE" | "BUSY";

type AssignmentStrategy = "ml-ranking" | "deterministic-fallback" | "hard-stop";

type AssignmentObserverEvents = {
  batch_start: (batch: AssignmentJob[]) => void;
  batch_end: (results: AssignmentDecision[]) => void;
  ml_failure: (error: Error, job: AssignmentJob) => void;
};

export interface AssignmentJob {
  ticketId: string;
  projectId: string;
  region?: string;
  requiredSkills: string[];
  priority: Priority;
  requestedAt: Date;
  identityDocument?: string;
}

export interface TechnicianProfile {
  id: string;
  name: string;
  document: string;
  regions: string[];
  skills: string[];
  availability: TechnicianAvailability;
  workload: number;
  maxWorkload: number;
  projects: string[];
  tier: "L1" | "L2" | "L3";
}

export interface AssignmentDecision {
  ticketId: string;
  technicianId?: string;
  strategy: AssignmentStrategy;
  rationale: string;
  candidatePool: string[];
  notes?: string[];
}

export interface AssignmentMetrics {
  enqueued: number;
  processed: number;
  mlFailures: number;
  fallbackDecisions: number;
  hardStops: number;
  queueDepth: number;
  lastBatchSize: number;
}

export type Ranker = (
  job: AssignmentJob,
  candidates: TechnicianProfile[]
) => Promise<TechnicianProfile[]>;

export type FallbackSelector = (
  job: AssignmentJob,
  candidates: TechnicianProfile[]
) => TechnicianProfile | undefined;

interface AssignmentEngineOptions {
  batchSize?: number;
  flushIntervalMs?: number;
  ranker?: Ranker;
  fallbackSelector?: FallbackSelector;
}

function hasRequiredSkills(candidate: TechnicianProfile, requiredSkills: string[]) {
  return requiredSkills.every((skill) => candidate.skills.includes(skill));
}

function withinCapacity(candidate: TechnicianProfile) {
  return candidate.workload < candidate.maxWorkload;
}

function supportsProject(candidate: TechnicianProfile, projectId: string) {
  return candidate.projects.includes(projectId);
}

function withinRegion(candidate: TechnicianProfile, region?: string) {
  if (!region) return true;
  return candidate.regions.includes(region);
}

export function filterCandidates(job: AssignmentJob, directory: TechnicianProfile[]): TechnicianProfile[] {
  return directory.filter(
    (candidate) =>
      candidate.availability !== "OFFLINE" &&
      withinCapacity(candidate) &&
      supportsProject(candidate, job.projectId) &&
      withinRegion(candidate, job.region) &&
      hasRequiredSkills(candidate, job.requiredSkills)
  );
}

function scoreByPriority(priority: Priority) {
  if (priority === "P1") return 1.2;
  if (priority === "P2") return 1.05;
  return 1;
}

function defaultRanker(job: AssignmentJob, candidates: TechnicianProfile[]): Promise<TechnicianProfile[]> {
  const ranked = [...candidates].sort((a, b) => {
    const priorityWeight = scoreByPriority(job.priority);
    const loadScoreA = a.workload / Math.max(a.maxWorkload, 1);
    const loadScoreB = b.workload / Math.max(b.maxWorkload, 1);
    const loadDelta = loadScoreA - loadScoreB;

    const tierScore = (tier: TechnicianProfile["tier"]) =>
      tier === "L3" ? 1 : tier === "L2" ? 0.9 : 0.75;

    const regionMatchA = job.region && a.regions.includes(job.region) ? 0.1 : 0;
    const regionMatchB = job.region && b.regions.includes(job.region) ? 0.1 : 0;

    const totalScoreA = priorityWeight - loadScoreA + tierScore(a.tier) + regionMatchA;
    const totalScoreB = priorityWeight - loadScoreB + tierScore(b.tier) + regionMatchB;

    return totalScoreB - totalScoreA || loadDelta || a.id.localeCompare(b.id);
  });

  return Promise.resolve(ranked);
}

export function deterministicFallback(job: AssignmentJob, candidates: TechnicianProfile[]): TechnicianProfile | undefined {
  return [...candidates].sort((a, b) => {
    if (a.workload !== b.workload) return a.workload - b.workload;
    if (a.tier !== b.tier) return a.tier.localeCompare(b.tier);
    return a.id.localeCompare(b.id);
  })[0];
}

export class AssignmentEngine {
  private readonly batchSize: number;
  private readonly flushIntervalMs: number;
  private readonly ranker: Ranker;
  private readonly fallbackSelector: FallbackSelector;
  private readonly emitter: EventEmitter;
  private buffer: AssignmentJob[] = [];
  private timer?: NodeJS.Timeout;
  private metrics: AssignmentMetrics = {
    enqueued: 0,
    processed: 0,
    mlFailures: 0,
    fallbackDecisions: 0,
    hardStops: 0,
    queueDepth: 0,
    lastBatchSize: 0,
  };

  constructor(private readonly directory: TechnicianProfile[], options: AssignmentEngineOptions = {}) {
    this.batchSize = options.batchSize ?? 20;
    this.flushIntervalMs = options.flushIntervalMs ?? 250;
    this.ranker = options.ranker ?? defaultRanker;
    this.fallbackSelector = options.fallbackSelector ?? deterministicFallback;
    this.emitter = new EventEmitter();
    if (this.flushIntervalMs > 0) {
      this.timer = setInterval(() => void this.flushPending(), this.flushIntervalMs);
    }
  }

  on<EventKey extends keyof AssignmentObserverEvents>(
    event: EventKey,
    listener: AssignmentObserverEvents[EventKey]
  ) {
    this.emitter.on(event, listener as (...args: unknown[]) => void);
  }

  enqueue(job: AssignmentJob) {
    this.buffer.push(job);
    this.metrics.enqueued += 1;
    this.metrics.queueDepth = this.buffer.length;

    if (this.buffer.length >= this.batchSize) {
      queueMicrotask(() => void this.flushPending());
    }
  }

  async flushPending(): Promise<AssignmentDecision[]> {
    if (this.buffer.length === 0) return [];

    const batch = this.buffer.splice(0, this.batchSize);
    this.metrics.queueDepth = this.buffer.length;
    this.metrics.lastBatchSize = batch.length;
    this.emitter.emit("batch_start", batch);

    const results = await Promise.all(batch.map((job) => this.processJob(job)));
    this.metrics.processed += results.length;
    this.emitter.emit("batch_end", results);

    return results;
  }

  getMetrics(): AssignmentMetrics {
    return { ...this.metrics, queueDepth: this.buffer.length };
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async processJob(job: AssignmentJob): Promise<AssignmentDecision> {
    const candidates = filterCandidates(job, this.directory);
    const candidatePool = candidates.map((candidate) => candidate.id);

    if (candidates.length === 0) {
      this.metrics.hardStops += 1;
      return {
        ticketId: job.ticketId,
        strategy: "hard-stop",
        rationale: "Ningún técnico cumple las reglas duras; requiere asignación manual",
        candidatePool,
        notes: ["Disponibilidad, región o proyecto no compatibles"],
      };
    }

    try {
      const ranked = await this.ranker(job, candidates);
      const topRanked = ranked[0];
      if (topRanked) {
        return {
          ticketId: job.ticketId,
          technicianId: topRanked.id,
          strategy: "ml-ranking",
          rationale: "Asignado usando ranker ML sobre técnicos filtrados",
          candidatePool,
        };
      }
    } catch (error) {
      this.metrics.mlFailures += 1;
      this.emitter.emit("ml_failure", error as Error, job);
    }

    this.metrics.fallbackDecisions += 1;
    const fallback = this.fallbackSelector(job, candidates);

    return {
      ticketId: job.ticketId,
      technicianId: fallback?.id,
      strategy: "deterministic-fallback",
      rationale: fallback
        ? "Asignación determinística por balance de carga al fallar el ranker ML"
        : "Sin candidatos tras filtros; mantiene la trazabilidad sin bloqueo",
      candidatePool,
      notes: fallback ? ["Eligió al técnico con menor carga y tier más bajo"] : ["Escalar a coordinación"],
    };
  }
}

const directory = technicianDirectory();

const sharedEngine = new AssignmentEngine(directory, {
  batchSize: 10,
  flushIntervalMs: 500,
});

export function getSharedAssignmentEngine() {
  return sharedEngine;
}

export function buildAssignmentJobs(job: ImportJob, tickets: string[]): AssignmentJob[] {
  const region = job.ml_insights?.geolocation_validation?.address_column ? "geo" : undefined;
  const requiredSkills = job.mode === "MASS_CREATE" ? ["batch-handling"] : ["post-service"];
  const identityDocument = job.ml_insights?.technician_assignment?.matches[0]?.document;

  return tickets.map((ticketId) => ({
    ticketId,
    projectId: job.project_id,
    region,
    requiredSkills,
    priority: job.mode === "POST_SERVICE" ? "P1" : "P2",
    requestedAt: new Date(),
    identityDocument: identityDocument ? normalizeDocumentId(identityDocument) : undefined,
  }));
}

export function scheduleAssignments(job: ImportJob, tickets: string[]) {
  const engine = getSharedAssignmentEngine();
  const assignments = buildAssignmentJobs(job, tickets);
  assignments.forEach((assignment) => engine.enqueue(assignment));
  return assignments.length;
}
