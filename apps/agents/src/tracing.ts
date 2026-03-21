import { randomUUID } from "node:crypto";

/**
 * Per-invocation execution trace for agentic debugging.
 * Tracks phase timings and tool execution context.
 */
export interface ExecutionTrace {
  invocationId: string;
  agentId: string;
  startTime: number;
  phases: {
    configLoad?: { duration: number; cacheHit: boolean };
    modelResolution?: { duration: number; modelId?: string; provider?: string };
    mcpSetup?: {
      duration: number;
      serverCount: number;
      failedServers: string[];
    };
    toolRegistry?: { duration: number; toolCount: number };
    stream?: {
      startLatency: number;
      duration: number;
      finishReason: string;
      tokenCount?: number;
    };
  };
  toolExecutions: Array<{
    toolId: string;
    toolName: string;
    args: unknown;
    duration: number;
    result?: unknown;
    error?: string;
  }>;
  errors: Array<{ phase: string; code: string; message: string }>;
  endTime: number;
}

/**
 * Tracer instance for a single agent invocation.
 * Accumulates phase timings, tool executions, and error context.
 */
export class ExecutionTracer {
  private trace: ExecutionTrace;

  get invocationId(): string {
    return this.trace.invocationId;
  }

  constructor(invocationId: string, agentId: string) {
    this.trace = {
      invocationId,
      agentId,
      startTime: Date.now(),
      phases: {},
      toolExecutions: [],
      errors: [],
      endTime: 0,
    };
  }

  recordPhase(
    phase: keyof ExecutionTrace["phases"],
    duration: number,
    data: Record<string, unknown>,
  ): void {
    (this.trace.phases as Record<string, unknown>)[phase] = {
      duration,
      ...data,
    };
  }

  recordToolExecution(
    toolId: string,
    toolName: string,
    args: unknown,
    duration: number,
    result: unknown,
    error?: string,
  ): void {
    this.trace.toolExecutions.push({
      toolId,
      toolName,
      args,
      duration,
      result,
      error,
    });
  }

  recordError(phase: string, code: string, message: string): void {
    this.trace.errors.push({ phase, code, message });
  }

  finalize(): ExecutionTrace {
    this.trace.endTime = Date.now();
    return this.trace;
  }
}

/**
 * Global trace context storage (per-request in async context).
 * In a real system, this would use AsyncLocalStorage.
 * For now, keyed by invocationId for retrieval.
 */
const traceStore = new Map<string, ExecutionTrace>();
const maxTraces = 100;

export function createTracer(agentId: string): ExecutionTracer {
  const invocationId = randomUUID();
  return new ExecutionTracer(invocationId, agentId);
}

export function storeTrace(trace: ExecutionTrace): void {
  traceStore.set(trace.invocationId, trace);
  // Simple LRU: if we exceed maxTraces, remove oldest
  if (traceStore.size > maxTraces) {
    const oldestKey = traceStore.keys().next().value;
    if (oldestKey) {
      traceStore.delete(oldestKey);
    }
  }
}

export function getTrace(invocationId: string): ExecutionTrace | undefined {
  return traceStore.get(invocationId);
}

export function getAllTraces(): ExecutionTrace[] {
  return Array.from(traceStore.values());
}

export function clearTraces(): void {
  traceStore.clear();
}
