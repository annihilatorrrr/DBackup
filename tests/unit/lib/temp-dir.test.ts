import { describe, it, expect, vi, afterEach } from "vitest";
import path from "path";
import { getTempDir, getTempPath } from "@/lib/temp-dir";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getTempDir", () => {
  it("returns TMPDIR env var when set", () => {
    vi.stubEnv("TMPDIR", "/custom/tmp");
    expect(getTempDir()).toBe("/custom/tmp");
  });

  it("falls back to os.tmpdir() when TMPDIR is not set", () => {
    vi.stubEnv("TMPDIR", "");
    const result = getTempDir();
    // os.tmpdir() returns a non-empty string on all platforms.
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("getTempPath", () => {
  it("joins the temp dir with the given filename", () => {
    vi.stubEnv("TMPDIR", "/custom/tmp");
    expect(getTempPath("backup.sql.gz")).toBe(
      path.join("/custom/tmp", "backup.sql.gz"),
    );
  });

  it("works when TMPDIR is not set (uses os.tmpdir())", () => {
    vi.stubEnv("TMPDIR", "");
    const result = getTempPath("test.tar");
    expect(result).toContain("test.tar");
  });
});
