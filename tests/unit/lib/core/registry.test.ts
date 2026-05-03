import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

const mockWarn = vi.hoisted(() => vi.fn());

vi.mock("@/lib/logging/logger", () => ({
  logger: {
    child: vi.fn().mockReturnValue({
      warn: mockWarn,
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

import { registry } from "@/lib/core/registry";

const schema = z.object({});

function makeAdapter(id: string, type: "database" | "storage" | "notification") {
  return { id, name: id, configSchema: schema, type } as any;
}

describe("AdapterRegistry", () => {
  beforeEach(() => {
    mockWarn.mockClear();
  });

  describe("register / get", () => {
    it("registers an adapter and retrieves it by id", () => {
      const adapter = makeAdapter("reg-test-db-1", "database");
      registry.register(adapter);
      expect(registry.get("reg-test-db-1")).toBe(adapter);
    });

    it("returns undefined for an unknown id", () => {
      expect(registry.get("completely-unknown-adapter")).toBeUndefined();
    });

    it("logs a warning and replaces adapter when id is already registered", () => {
      const first = makeAdapter("reg-overwrite-1", "database");
      const second = makeAdapter("reg-overwrite-1", "database");
      registry.register(first);
      registry.register(second);
      expect(mockWarn).toHaveBeenCalledOnce();
      expect(registry.get("reg-overwrite-1")).toBe(second);
    });
  });

  describe("getAll", () => {
    it("includes all previously registered adapters", () => {
      const a = makeAdapter("getall-db-x", "database");
      const b = makeAdapter("getall-storage-x", "storage");
      registry.register(a);
      registry.register(b);
      const all = registry.getAll();
      expect(all).toContain(a);
      expect(all).toContain(b);
    });
  });

  describe("getDatabaseAdapters", () => {
    it("returns database-type adapters and excludes other types", () => {
      registry.register(makeAdapter("bytype-db-1", "database"));
      registry.register(makeAdapter("bytype-storage-1", "storage"));
      const dbs = registry.getDatabaseAdapters();
      expect(dbs.some((a) => a.id === "bytype-db-1")).toBe(true);
      expect(dbs.some((a) => a.id === "bytype-storage-1")).toBe(false);
    });
  });

  describe("getStorageAdapters", () => {
    it("returns storage-type adapters and excludes other types", () => {
      registry.register(makeAdapter("bytype-db-2", "database"));
      registry.register(makeAdapter("bytype-storage-2", "storage"));
      const storages = registry.getStorageAdapters();
      expect(storages.some((a) => a.id === "bytype-storage-2")).toBe(true);
      expect(storages.some((a) => a.id === "bytype-db-2")).toBe(false);
    });
  });

  describe("getNotificationAdapters", () => {
    it("returns notification-type adapters and excludes other types", () => {
      registry.register(makeAdapter("bytype-notif-1", "notification"));
      registry.register(makeAdapter("bytype-db-3", "database"));
      const notifs = registry.getNotificationAdapters();
      expect(notifs.some((a) => a.id === "bytype-notif-1")).toBe(true);
      expect(notifs.some((a) => a.id === "bytype-db-3")).toBe(false);
    });
  });

  describe("getByType with unknown type", () => {
    it("returns an empty array for an unrecognised adapter type", () => {
      registry.register(makeAdapter("bytype-unknown-1", "database"));
      // Cast required to bypass TypeScript's type guard and hit the defensive fallback.
      const result = (registry as any).getByType("unknown-type" as any);
      expect(result.some((a: any) => a.id === "bytype-unknown-1")).toBe(false);
    });
  });
});
