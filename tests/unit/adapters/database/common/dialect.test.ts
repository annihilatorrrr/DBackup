import { describe, it, expect } from "vitest";
import { BaseDialect } from "@/lib/adapters/database/common/dialect";
import type { AnyDatabaseConfig } from "@/lib/adapters/definitions";

class ConcreteDialect extends BaseDialect {
    getDumpArgs(_config: AnyDatabaseConfig, _databases: string[]): string[] {
        return [];
    }
    getRestoreArgs(_config: AnyDatabaseConfig, _targetDatabase?: string): string[] {
        return [];
    }
    getConnectionArgs(_config: AnyDatabaseConfig): string[] {
        return [];
    }
}

describe("BaseDialect", () => {
    it("supportsVersion() returns true by default", () => {
        const dialect = new ConcreteDialect();
        expect(dialect.supportsVersion("8.0.32")).toBe(true);
        expect(dialect.supportsVersion("15.2")).toBe(true);
    });
});
