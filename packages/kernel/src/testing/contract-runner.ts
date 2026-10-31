/** Minimal shape of a test runner's `describe`, so a contract suite imports no framework. */
export type DescribeFn = (name: string, body: () => void) => void;

/** Minimal shape of a test runner's `it`. */
export type ItFn = (name: string, body: () => Promise<void>) => void;

/** The assertions the contract suites rely on; Vitest's and Jest's `expect` both satisfy it. */
export interface ContractAssertion {
	toBe(expected: unknown): void;
	toEqual(expected: unknown): void;
	toBeNull(): void;
	toBeInstanceOf(expected: abstract new (...args: never[]) => unknown): void;
}

/** Minimal shape of a test runner's `expect`. */
export type ExpectFn = (actual: unknown) => ContractAssertion;
