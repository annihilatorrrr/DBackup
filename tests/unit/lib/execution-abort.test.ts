import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    registerExecution,
    unregisterExecution,
    abortExecution,
    isExecutionRunning,
} from '@/lib/execution/abort';

// The abort module uses a module-level Map - clear state between tests
// by re-importing via a fresh module instance would require unstable_resetModules.
// Instead, we ensure each test cleans up its own registrations.

describe('execution abort registry', () => {
    const id1 = 'exec-abc-001';
    const id2 = 'exec-abc-002';

    beforeEach(() => {
        // Clean up any leftover registrations from previous test runs
        unregisterExecution(id1);
        unregisterExecution(id2);
    });

    describe('registerExecution', () => {
        it('returns an AbortController', () => {
            const controller = registerExecution(id1);
            expect(controller).toBeInstanceOf(AbortController);
            unregisterExecution(id1);
        });

        it('registers the execution as running', () => {
            registerExecution(id1);
            expect(isExecutionRunning(id1)).toBe(true);
            unregisterExecution(id1);
        });

        it('overrides a previous registration for the same ID', () => {
            const ctrl1 = registerExecution(id1);
            const ctrl2 = registerExecution(id1);
            expect(ctrl1).not.toBe(ctrl2);
            unregisterExecution(id1);
        });
    });

    describe('unregisterExecution', () => {
        it('removes a registered execution', () => {
            registerExecution(id1);
            unregisterExecution(id1);
            expect(isExecutionRunning(id1)).toBe(false);
        });

        it('is a no-op when execution is not registered', () => {
            expect(() => unregisterExecution('non-existent-id')).not.toThrow();
        });
    });

    describe('abortExecution', () => {
        it('returns true and signals the AbortController', () => {
            const controller = registerExecution(id1);
            const aborted = abortExecution(id1);

            expect(aborted).toBe(true);
            expect(controller.signal.aborted).toBe(true);
            unregisterExecution(id1);
        });

        it('returns false for an unknown execution ID', () => {
            const result = abortExecution('unknown-exec-id');
            expect(result).toBe(false);
        });

        it('does not throw when aborting an already-aborted controller', () => {
            const controller = registerExecution(id1);
            controller.abort();
            expect(() => abortExecution(id1)).not.toThrow();
            unregisterExecution(id1);
        });
    });

    describe('isExecutionRunning', () => {
        it('returns false for an unregistered ID', () => {
            expect(isExecutionRunning('definitely-not-registered')).toBe(false);
        });

        it('returns true after registration and false after unregistration', () => {
            registerExecution(id2);
            expect(isExecutionRunning(id2)).toBe(true);
            unregisterExecution(id2);
            expect(isExecutionRunning(id2)).toBe(false);
        });
    });

    describe('multiple concurrent executions', () => {
        it('tracks multiple executions independently', () => {
            registerExecution(id1);
            registerExecution(id2);

            expect(isExecutionRunning(id1)).toBe(true);
            expect(isExecutionRunning(id2)).toBe(true);

            abortExecution(id1);
            // Aborting id1 does not affect id2
            expect(isExecutionRunning(id2)).toBe(true);

            unregisterExecution(id1);
            unregisterExecution(id2);
        });
    });
});
