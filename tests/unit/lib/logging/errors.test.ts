import { describe, it, expect } from "vitest";
import {
  DBackupError,
  AdapterError,
  ConnectionError,
  ConfigurationError,
  ServiceError,
  NotFoundError,
  ConflictError,
  ValidationError,
  PermissionError,
  AuthenticationError,
  BackupError,
  RestoreError,
  EncryptionError,
  QueueError,
  ApiKeyError,
  isDBackupError,
  wrapError,
  getErrorMessage,
  getErrorCode,
  withContext,
} from "@/lib/logging/errors";

// ── DBackupError (base) ───────────────────────────────────────

describe("DBackupError", () => {
  it("sets message, code, name and isOperational defaults", () => {
    const err = new DBackupError("something failed", "TEST_CODE");
    expect(err.message).toBe("something failed");
    expect(err.code).toBe("TEST_CODE");
    expect(err.name).toBe("DBackupError");
    expect(err.isOperational).toBe(true);
    expect(err.timestamp).toBeInstanceOf(Date);
    expect(err.context).toBeUndefined();
  });

  it("sets isOperational to false when specified", () => {
    const err = new DBackupError("msg", "CODE", { isOperational: false });
    expect(err.isOperational).toBe(false);
  });

  it("chains cause error", () => {
    const cause = new Error("root cause");
    const err = new DBackupError("wrapped", "CODE", { cause });
    expect(err.cause).toBe(cause);
  });

  it("stores context", () => {
    const err = new DBackupError("msg", "CODE", { context: { key: "val" } });
    expect(err.context).toEqual({ key: "val" });
  });

  it("toJSON serialises all fields", () => {
    const cause = new Error("cause msg");
    const err = new DBackupError("msg", "CODE", { cause, context: { a: 1 } });
    const json = err.toJSON();
    expect(json.name).toBe("DBackupError");
    expect(json.code).toBe("CODE");
    expect(json.message).toBe("msg");
    expect(typeof json.timestamp).toBe("string");
    expect(json.context).toEqual({ a: 1 });
    expect(json.cause).toBe("cause msg");
  });

  it("toJSON sets cause to undefined when there is no cause", () => {
    const err = new DBackupError("msg", "CODE");
    const json = err.toJSON();
    expect(json.cause).toBeUndefined();
  });
});

// ── AdapterError ─────────────────────────────────────────────

describe("AdapterError", () => {
  it("builds message from adapterId, operation and message", () => {
    const err = new AdapterError("mysql", "dump", "timeout");
    expect(err.message).toBe("[mysql] dump: timeout");
    expect(err.adapterId).toBe("mysql");
    expect(err.operation).toBe("dump");
    expect(err.code).toBe("ADAPTER_ERROR");
  });

  it("merges extra context with adapterId/operation", () => {
    const err = new AdapterError("s3", "upload", "fail", {
      context: { bucket: "my-bucket" },
    });
    expect(err.context).toMatchObject({ bucket: "my-bucket", adapterId: "s3", operation: "upload" });
  });
});

// ── ConnectionError ───────────────────────────────────────────

describe("ConnectionError", () => {
  it("has code CONNECTION_ERROR and correct operation", () => {
    const err = new ConnectionError("postgres", "refused");
    expect(err.code).toBe("CONNECTION_ERROR");
    expect(err.operation).toBe("connect");
    expect(err.adapterId).toBe("postgres");
  });

  it("chains cause", () => {
    const cause = new Error("ECONNREFUSED");
    const err = new ConnectionError("mongo", "refused", { cause });
    expect(err.cause).toBe(cause);
  });
});

// ── ConfigurationError ────────────────────────────────────────

describe("ConfigurationError", () => {
  it("has code CONFIGURATION_ERROR", () => {
    const err = new ConfigurationError("sftp", "missing host");
    expect(err.code).toBe("CONFIGURATION_ERROR");
    expect(err.operation).toBe("configure");
  });
});

// ── ServiceError ──────────────────────────────────────────────

describe("ServiceError", () => {
  it("sets service and operation", () => {
    const err = new ServiceError("BackupService", "runJob", "job not found");
    expect(err.service).toBe("BackupService");
    expect(err.operation).toBe("runJob");
    expect(err.code).toBe("SERVICE_ERROR");
  });

  it("accepts custom code", () => {
    const err = new ServiceError("S", "op", "msg", { code: "CUSTOM" });
    expect(err.code).toBe("CUSTOM");
  });
});

// ── NotFoundError ─────────────────────────────────────────────

describe("NotFoundError", () => {
  it("builds a readable message", () => {
    const err = new NotFoundError("Job", "abc-123");
    expect(err.message).toContain("Job not found: abc-123");
    expect(err.resource).toBe("Job");
    expect(err.identifier).toBe("abc-123");
    expect(err.code).toBe("NOT_FOUND");
  });
});

// ── ConflictError ─────────────────────────────────────────────

describe("ConflictError", () => {
  it("has code CONFLICT", () => {
    const err = new ConflictError("resource is still referenced");
    expect(err.code).toBe("CONFLICT");
    expect(err.message).toBe("resource is still referenced");
  });
});

// ── ValidationError ───────────────────────────────────────────

describe("ValidationError", () => {
  it("stores field and details", () => {
    const err = new ValidationError("invalid input", {
      field: "email",
      details: { email: ["must be a valid email"] },
    });
    expect(err.code).toBe("VALIDATION_ERROR");
    expect(err.field).toBe("email");
    expect(err.details).toEqual({ email: ["must be a valid email"] });
  });

  it("works without optional fields", () => {
    const err = new ValidationError("bad data");
    expect(err.field).toBeUndefined();
    expect(err.details).toBeUndefined();
  });
});

// ── PermissionError ───────────────────────────────────────────

describe("PermissionError", () => {
  it("has code PERMISSION_DENIED", () => {
    const err = new PermissionError("USERS.WRITE");
    expect(err.code).toBe("PERMISSION_DENIED");
    expect(err.requiredPermission).toBe("USERS.WRITE");
    expect(err.message).toContain("USERS.WRITE");
  });
});

// ── AuthenticationError ───────────────────────────────────────

describe("AuthenticationError", () => {
  it("uses default message", () => {
    const err = new AuthenticationError();
    expect(err.code).toBe("AUTHENTICATION_REQUIRED");
    expect(err.message).toBe("Authentication required");
  });

  it("accepts custom message", () => {
    const err = new AuthenticationError("Token expired");
    expect(err.message).toBe("Token expired");
  });
});

// ── BackupError ───────────────────────────────────────────────

describe("BackupError", () => {
  it("sets code BACKUP_ERROR", () => {
    const err = new BackupError("dump failed");
    expect(err.code).toBe("BACKUP_ERROR");
  });

  it("stores jobId, executionId and step", () => {
    const err = new BackupError("failed", {
      jobId: "job-1",
      executionId: "exec-1",
      step: "02-dump",
    });
    expect(err.jobId).toBe("job-1");
    expect(err.executionId).toBe("exec-1");
    expect(err.step).toBe("02-dump");
  });

  it("works without options", () => {
    const err = new BackupError("failed");
    expect(err.jobId).toBeUndefined();
    expect(err.executionId).toBeUndefined();
    expect(err.step).toBeUndefined();
  });

  it("chains cause", () => {
    const cause = new Error("io error");
    const err = new BackupError("failed", { cause });
    expect(err.cause).toBe(cause);
  });
});

// ── RestoreError ──────────────────────────────────────────────

describe("RestoreError", () => {
  it("sets code RESTORE_ERROR", () => {
    const err = new RestoreError("restore failed");
    expect(err.code).toBe("RESTORE_ERROR");
  });

  it("stores executionId and sourcePath", () => {
    const err = new RestoreError("failed", {
      executionId: "exec-2",
      sourcePath: "/tmp/backup.sql",
    });
    expect(err.executionId).toBe("exec-2");
    expect(err.sourcePath).toBe("/tmp/backup.sql");
  });

  it("works without options", () => {
    const err = new RestoreError("failed");
    expect(err.executionId).toBeUndefined();
    expect(err.sourcePath).toBeUndefined();
  });

  it("chains cause", () => {
    const cause = new Error("stream error");
    const err = new RestoreError("failed", { cause });
    expect(err.cause).toBe(cause);
  });
});

// ── EncryptionError ───────────────────────────────────────────

describe("EncryptionError", () => {
  it("stores operation encrypt", () => {
    const err = new EncryptionError("encrypt", "key too short");
    expect(err.code).toBe("ENCRYPTION_ERROR");
    expect(err.operation).toBe("encrypt");
  });

  it("stores operation decrypt", () => {
    const err = new EncryptionError("decrypt", "bad auth tag");
    expect(err.operation).toBe("decrypt");
  });

  it("chains cause", () => {
    const cause = new Error("underlying crypto error");
    const err = new EncryptionError("decrypt", "failed", { cause });
    expect(err.cause).toBe(cause);
  });
});

// ── QueueError ────────────────────────────────────────────────

describe("QueueError", () => {
  it("sets code QUEUE_ERROR and stores operation", () => {
    const err = new QueueError("enqueue", "queue is full");
    expect(err.code).toBe("QUEUE_ERROR");
    expect(err.queueOperation).toBe("enqueue");
    expect(err.message).toBe("queue is full");
  });

  it("chains cause", () => {
    const cause = new Error("db error");
    const err = new QueueError("dequeue", "failed", { cause });
    expect(err.cause).toBe(cause);
  });
});

// ── ApiKeyError ───────────────────────────────────────────────

describe("ApiKeyError", () => {
  it("sets code API_KEY_ERROR and stores reason", () => {
    const err = new ApiKeyError("expired", "API key is expired");
    expect(err.code).toBe("API_KEY_ERROR");
    expect(err.reason).toBe("expired");
    expect(err.message).toBe("API key is expired");
  });
});

// ── isDBackupError ────────────────────────────────────────────

describe("isDBackupError", () => {
  it("returns true for DBackupError instances", () => {
    expect(isDBackupError(new DBackupError("m", "C"))).toBe(true);
  });

  it("returns true for subclass instances", () => {
    expect(isDBackupError(new BackupError("m"))).toBe(true);
  });

  it("returns false for plain Error", () => {
    expect(isDBackupError(new Error("plain"))).toBe(false);
  });

  it("returns false for non-errors", () => {
    expect(isDBackupError("a string")).toBe(false);
    expect(isDBackupError(null)).toBe(false);
  });
});

// ── wrapError ─────────────────────────────────────────────────

describe("wrapError", () => {
  it("returns DBackupError unchanged", () => {
    const err = new BackupError("m");
    expect(wrapError(err)).toBe(err);
  });

  it("wraps a plain Error", () => {
    const plain = new Error("plain");
    const wrapped = wrapError(plain);
    expect(wrapped).toBeInstanceOf(DBackupError);
    expect(wrapped.message).toBe("plain");
    expect(wrapped.code).toBe("UNKNOWN_ERROR");
    expect(wrapped.isOperational).toBe(false);
    expect(wrapped.cause).toBe(plain);
  });

  it("wraps a string error", () => {
    const wrapped = wrapError("something broke");
    expect(wrapped.message).toBe("something broke");
    expect(wrapped.code).toBe("UNKNOWN_ERROR");
  });

  it("uses fallbackMessage for unknown types", () => {
    const wrapped = wrapError(42);
    expect(wrapped.message).toBe("An unexpected error occurred");
  });

  it("accepts custom fallbackMessage", () => {
    const wrapped = wrapError(null, "custom fallback");
    expect(wrapped.message).toBe("custom fallback");
  });
});

// ── getErrorMessage ───────────────────────────────────────────

describe("getErrorMessage", () => {
  it("returns message from DBackupError", () => {
    expect(getErrorMessage(new DBackupError("dbackup msg", "C"))).toBe("dbackup msg");
  });

  it("returns message from plain Error", () => {
    expect(getErrorMessage(new Error("plain msg"))).toBe("plain msg");
  });

  it("returns string as-is", () => {
    expect(getErrorMessage("raw string")).toBe("raw string");
  });

  it("returns fallback for unknown types", () => {
    expect(getErrorMessage(null)).toBe("An unexpected error occurred");
    expect(getErrorMessage(undefined)).toBe("An unexpected error occurred");
    expect(getErrorMessage(42)).toBe("An unexpected error occurred");
  });
});

// ── getErrorCode ──────────────────────────────────────────────

describe("getErrorCode", () => {
  it("returns code from DBackupError", () => {
    expect(getErrorCode(new DBackupError("m", "MY_CODE"))).toBe("MY_CODE");
  });

  it("returns UNKNOWN_ERROR for plain Error", () => {
    expect(getErrorCode(new Error("plain"))).toBe("UNKNOWN_ERROR");
  });

  it("returns UNKNOWN_ERROR for non-error values", () => {
    expect(getErrorCode("string")).toBe("UNKNOWN_ERROR");
    expect(getErrorCode(null)).toBe("UNKNOWN_ERROR");
  });
});

// ── withContext ───────────────────────────────────────────────

describe("withContext", () => {
  it("adds context to a DBackupError", () => {
    const original = new DBackupError("msg", "CODE", { context: { a: 1 } });
    const result = withContext(original, { b: 2 });
    expect(result).toBeInstanceOf(DBackupError);
    expect(result.message).toBe("msg");
    expect(result.code).toBe("CODE");
    expect(result.context).toMatchObject({ a: 1, b: 2 });
  });

  it("wraps a plain Error and adds context", () => {
    const plain = new Error("raw error");
    const result = withContext(plain, { jobId: "j1" });
    expect(result).toBeInstanceOf(DBackupError);
    expect(result.context).toMatchObject({ jobId: "j1" });
  });

  it("handles non-Error values", () => {
    const result = withContext("string error", { step: "dump" });
    expect(result).toBeInstanceOf(DBackupError);
    expect(result.context).toMatchObject({ step: "dump" });
  });

  it("preserves isOperational flag", () => {
    const original = new DBackupError("m", "C", { isOperational: false });
    const result = withContext(original, { extra: true });
    expect(result.isOperational).toBe(false);
  });

  it("chains the original error as cause when the wrapped error has a cause", () => {
    const cause = new Error("root");
    const plain = new Error("wrapper");
    plain.cause = cause;
    // wrapError wraps plain as cause, withContext preserves that
    const result = withContext(plain, { key: "val" });
    expect(result.cause).toBe(plain);
  });
});
