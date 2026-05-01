import { describe, it, expect } from "vitest";
import { stageProgress, PIPELINE_STAGES, STAGE_PROGRESS_MAP } from "@/lib/core/logs";

describe("stageProgress", () => {
  it("returns 0 for an unknown stage", () => {
    expect(stageProgress("UnknownStage" as any, 50)).toBe(0);
  });

  it("returns the min of the range when internalPercent is 0", () => {
    const [min] = STAGE_PROGRESS_MAP[PIPELINE_STAGES.UPLOADING];
    expect(stageProgress(PIPELINE_STAGES.UPLOADING, 0)).toBe(min);
  });

  it("returns the max of the range when internalPercent is 100", () => {
    const [, max] = STAGE_PROGRESS_MAP[PIPELINE_STAGES.UPLOADING];
    expect(stageProgress(PIPELINE_STAGES.UPLOADING, 100)).toBe(max);
  });

  it("interpolates correctly at 50% for Uploading stage", () => {
    // Uploading: [65, 88] -> 65 + (88 - 65) * 0.5 = 76.5 -> rounds to 77
    expect(stageProgress(PIPELINE_STAGES.UPLOADING, 50)).toBe(77);
  });

  it("clamps internalPercent below 0 to 0", () => {
    const [min] = STAGE_PROGRESS_MAP[PIPELINE_STAGES.DUMPING];
    expect(stageProgress(PIPELINE_STAGES.DUMPING, -99)).toBe(min);
  });

  it("clamps internalPercent above 100 to 100", () => {
    const [, max] = STAGE_PROGRESS_MAP[PIPELINE_STAGES.DUMPING];
    expect(stageProgress(PIPELINE_STAGES.DUMPING, 150)).toBe(max);
  });

  it("returns 100 for the Completed stage regardless of internal progress", () => {
    // Completed: [100, 100]
    expect(stageProgress(PIPELINE_STAGES.COMPLETED, 0)).toBe(100);
    expect(stageProgress(PIPELINE_STAGES.COMPLETED, 50)).toBe(100);
  });

  it("returns 0 for the Queued stage regardless of internal progress", () => {
    // Queued: [0, 0]
    expect(stageProgress(PIPELINE_STAGES.QUEUED, 0)).toBe(0);
    expect(stageProgress(PIPELINE_STAGES.QUEUED, 100)).toBe(0);
  });
});
