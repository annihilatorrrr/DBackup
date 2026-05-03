import { describe, it, expect, vi, afterEach } from "vitest";
import { ProgressMonitorStream } from "@/lib/streams/progress-monitor";
import { Readable, Writable } from "stream";
import { pipeline } from "stream/promises";

describe("ProgressMonitorStream", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes chunks through to the readable side unchanged", async () => {
    const onProgress = vi.fn();
    const monitor = new ProgressMonitorStream(5, onProgress);
    const collected: Buffer[] = [];

    await pipeline(
      Readable.from([Buffer.from("hello")]),
      monitor,
      new Writable({ write(chunk, _, cb) { collected.push(chunk); cb(); } })
    );

    expect(Buffer.concat(collected).toString()).toBe("hello");
  });

  it("tracks accumulated processedBytes and reports them on flush", async () => {
    const onProgress = vi.fn();
    const monitor = new ProgressMonitorStream(100, onProgress);

    await pipeline(
      Readable.from([Buffer.from("hello")]),
      monitor,
      new Writable({ write: (_, __, cb) => cb() })
    );

    expect(onProgress).toHaveBeenCalled();
    const [processed, total] = onProgress.mock.calls.at(-1)!;
    expect(processed).toBe(5);
    expect(total).toBe(100);
  });

  it("calculates percent correctly based on processed vs total bytes", async () => {
    const onProgress = vi.fn();
    const monitor = new ProgressMonitorStream(100, onProgress);

    await pipeline(
      Readable.from([Buffer.from("x".repeat(75))]),
      monitor,
      new Writable({ write: (_, __, cb) => cb() })
    );

    const [, , percent] = onProgress.mock.calls.at(-1)!;
    expect(percent).toBe(75);
  });

  it("reports percent 0 when totalBytes is 0", async () => {
    const onProgress = vi.fn();
    const monitor = new ProgressMonitorStream(0, onProgress);

    await pipeline(
      Readable.from([Buffer.from("data")]),
      monitor,
      new Writable({ write: (_, __, cb) => cb() })
    );

    const [, , percent] = onProgress.mock.calls.at(-1)!;
    expect(percent).toBe(0);
  });

  it("reports speed 0 when no time has elapsed since construction", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0); // startTime = 0, Date.now() = 0 throughout

    const onProgress = vi.fn();
    const monitor = new ProgressMonitorStream(10, onProgress);

    await pipeline(
      Readable.from([Buffer.from("x".repeat(10))]),
      monitor,
      new Writable({ write: (_, __, cb) => cb() })
    );

    const [, , , speed] = onProgress.mock.calls.at(-1)!;
    expect(speed).toBe(0);
  });

  it("suppresses intermediate callbacks within the 300ms throttle window", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0); // lastUpdate = 0, Date.now() = 0 -> 0 - 0 not > 300 for every chunk

    const onProgress = vi.fn();
    const monitor = new ProgressMonitorStream(300, onProgress);

    await pipeline(
      Readable.from([
        Buffer.from("x".repeat(100)),
        Buffer.from("x".repeat(100)),
        Buffer.from("x".repeat(100)),
      ]),
      monitor,
      new Writable({ write: (_, __, cb) => cb() })
    );

    // All transform calls are throttled (t=0 == lastUpdate=0), only _flush fires onProgress
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it("emits progress during transform once the 300ms interval has elapsed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const onProgress = vi.fn();
    const monitor = new ProgressMonitorStream(1000, onProgress);
    monitor.resume(); // discard readable output

    // t=0: 0 - lastUpdate(0) = 0, not > 300 - no emit
    monitor.write(Buffer.from("x".repeat(100)));
    expect(onProgress).not.toHaveBeenCalled();

    // Advance 400ms past the throttle interval
    vi.advanceTimersByTime(400);

    // t=400: 400 - lastUpdate(0) = 400 > 300 - emit
    monitor.write(Buffer.from("x".repeat(100)));
    expect(onProgress).toHaveBeenCalledTimes(1);

    monitor.destroy();
  });
});
