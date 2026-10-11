// Declaration types for bun:test to satisfy TypeScript typechecking without external package additions

declare module 'bun:test' {
  export interface ExpectMatchers {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeGreaterThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toBeString(): void;
    toContain(expected: unknown): void;
    toBeDefined(): void;
    toThrow(expected?: string | RegExp): void;
    rejects: {
      toThrow(expected?: string | RegExp): Promise<void>;
    };
  }

  export function describe(name: string, fn: () => void | Promise<void>): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function expect(actual: unknown): ExpectMatchers;
  export function mock<T extends (...args: unknown[]) => unknown>(fn?: T): T;
  export namespace mock {
    export function module(moduleName: string, factory: () => unknown): void;
  }
  export function beforeEach(fn: () => void | Promise<void>): void;
  export function afterEach(fn: () => void | Promise<void>): void;
  export function beforeAll(fn: () => void | Promise<void>): void;
  export function afterAll(fn: () => void | Promise<void>): void;
}
