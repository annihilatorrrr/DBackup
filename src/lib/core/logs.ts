export type LogLevel = "info" | "success" | "warning" | "error";
export type LogType = "general" | "command" | "storage" | "security";

export interface LogEntry {
  timestamp: string; // ISO String
  level: LogLevel;
  type: LogType;
  message: string;
  stage?: string; // High-level stage grouping — should be a PipelineStage value
  details?: string; // For long output like stdout/stderr
  context?: Record<string, any>; // For metadata
  durationMs?: number;
}

// --- Pipeline Stage System ---

export const PIPELINE_STAGES = {
  QUEUED: "Queued",
  INITIALIZING: "Initializing",
  DUMPING: "Dumping Database",
  PROCESSING: "Processing",
  UPLOADING: "Uploading",
  VERIFYING: "Verifying",
  RETENTION: "Applying Retention",
  NOTIFICATIONS: "Sending Notifications",
  COMPLETED: "Completed",
  FAILED: "Failed",
} as const;

export type PipelineStage = typeof PIPELINE_STAGES[keyof typeof PIPELINE_STAGES];

/** Ordered list of stages for frontend rendering (skip FAILED — it's a terminal state) */
export const STAGE_ORDER: PipelineStage[] = [
  PIPELINE_STAGES.QUEUED,
  PIPELINE_STAGES.INITIALIZING,
  PIPELINE_STAGES.DUMPING,
  PIPELINE_STAGES.PROCESSING,
  PIPELINE_STAGES.UPLOADING,
  PIPELINE_STAGES.VERIFYING,
  PIPELINE_STAGES.RETENTION,
  PIPELINE_STAGES.NOTIFICATIONS,
  PIPELINE_STAGES.COMPLETED,
];

/** Progress ranges [min, max] for each stage, forming a continuous 0→100 scale */
export const STAGE_PROGRESS_MAP: Record<PipelineStage, [number, number]> = {
  [PIPELINE_STAGES.QUEUED]:          [0, 0],
  [PIPELINE_STAGES.INITIALIZING]:   [0, 5],
  [PIPELINE_STAGES.DUMPING]:        [5, 45],
  [PIPELINE_STAGES.PROCESSING]:     [45, 65],
  [PIPELINE_STAGES.UPLOADING]:      [65, 88],
  [PIPELINE_STAGES.VERIFYING]:      [88, 92],
  [PIPELINE_STAGES.RETENTION]:      [92, 97],
  [PIPELINE_STAGES.NOTIFICATIONS]:  [97, 100],
  [PIPELINE_STAGES.COMPLETED]:      [100, 100],
  [PIPELINE_STAGES.FAILED]:         [100, 100],
};

/**
 * Calculate global progress (0–100) from a stage and its internal progress (0–100).
 * Example: stageProgress("Uploading", 50) → 76  (midpoint of 65..88)
 */
export function stageProgress(stage: PipelineStage, internalPercent: number): number {
  const range = STAGE_PROGRESS_MAP[stage];
  if (!range) return 0;
  const [min, max] = range;
  const clamped = Math.max(0, Math.min(100, internalPercent));
  return Math.round(min + (max - min) * (clamped / 100));
}
