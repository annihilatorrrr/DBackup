import { describe, it, expect } from "vitest";
import {
  cn,
  formatBytes,
  formatDuration,
  formatTwoFactorCode,
  compareVersions,
} from "@/lib/utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("deduplicates conflicting Tailwind classes", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});

describe("formatBytes", () => {
  it("returns '0 Bytes' for 0", () => {
    expect(formatBytes(0)).toBe("0 Bytes");
  });

  it("returns '0 Bytes' for falsy non-zero (NaN / undefined via cast)", () => {
    expect(formatBytes(NaN)).toBe("0 Bytes");
  });

  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 Bytes");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1024 * 1024)).toBe("1 MB");
  });

  it("respects custom decimal places", () => {
    expect(formatBytes(1536, 1)).toBe("1.5 KB");
  });

  it("clamps negative decimals to 0", () => {
    expect(formatBytes(1024, -3)).toBe("1 KB");
  });
});

describe("formatDuration", () => {
  it("returns ms label for durations under 1 second", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(999)).toBe("999ms");
  });

  it("returns seconds label for durations under 1 minute", () => {
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(59_000)).toBe("59s");
  });

  it("returns minutes + seconds label for durations >= 1 minute", () => {
    expect(formatDuration(60_000)).toBe("1m 0s");
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(3_661_000)).toBe("61m 1s");
  });
});

describe("formatTwoFactorCode", () => {
  it("strips non-digit characters", () => {
    expect(formatTwoFactorCode("12 34 56")).toBe("123456");
    expect(formatTwoFactorCode("abc123def456")).toBe("123456");
  });

  it("truncates to 6 digits", () => {
    expect(formatTwoFactorCode("1234567890")).toBe("123456");
  });

  it("passes through a valid 6-digit code unchanged", () => {
    expect(formatTwoFactorCode("123456")).toBe("123456");
  });

  it("returns empty string for input with no digits", () => {
    expect(formatTwoFactorCode("abcdef")).toBe("");
  });
});

describe("compareVersions", () => {
  it("returns 0 when either version is undefined", () => {
    expect(compareVersions(undefined, "1.0")).toBe(0);
    expect(compareVersions("1.0", undefined)).toBe(0);
    expect(compareVersions(undefined, undefined)).toBe(0);
  });

  it("returns 1 when v1 is newer", () => {
    expect(compareVersions("8.0.4", "5.7")).toBe(1);
    expect(compareVersions("10.0", "9.9.9")).toBe(1);
  });

  it("returns -1 when v1 is older", () => {
    expect(compareVersions("5.7", "8.0.4")).toBe(-1);
  });

  it("returns 0 for equal versions", () => {
    expect(compareVersions("8.0.4", "8.0.4")).toBe(0);
  });

  it("handles version strings with extra text (MariaDB, PostgreSQL)", () => {
    expect(compareVersions("10.11.6-MariaDB", "10.11.5")).toBe(1);
    expect(compareVersions("PostgreSQL 16.1 on ...", "16.0")).toBe(1);
  });

  it("pads shorter version with zeros for comparison", () => {
    expect(compareVersions("8", "8.0.0")).toBe(0);
    expect(compareVersions("8.0", "8.0.1")).toBe(-1);
  });

  it("returns 0 when version string contains no digit sequence", () => {
    expect(compareVersions("beta", "beta")).toBe(0);
  });
});
