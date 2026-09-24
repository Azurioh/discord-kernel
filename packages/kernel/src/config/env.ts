/**
 * Generic, dependency-free helpers for reading and validating environment
 * variables. The concrete application config (which keys exist, their defaults)
 * is assembled by the composition root in `bootstrap/config.ts` — the core only
 * provides the primitives so any bot can declare its own shape.
 */

import { InvalidEnvError, MissingEnvError } from "@/config/errors";

type Env = Record<string, string | undefined>;

/** Read a required variable, throwing {@link MissingEnvError} when absent. */
export function requireEnv(key: string, env: Env = process.env): string {
	const value = env[key];
	if (value === undefined || value.trim() === "") {
		throw new MissingEnvError(key);
	}
	return value;
}

/** Read an optional variable, returning `fallback` (or `undefined`) when absent. */
export function optionalEnv(
	key: string,
	fallback?: string,
	env: Env = process.env,
): string | undefined {
	const value = env[key];
	if (value === undefined || value.trim() === "") {
		return fallback;
	}
	return value;
}

/** Read a boolean variable (`true`/`1`/`yes` are truthy). */
export function boolEnv(key: string, fallback: boolean, env: Env = process.env): boolean {
	const value = env[key]?.trim().toLowerCase();
	if (value === undefined || value === "") {
		return fallback;
	}
	return value === "true" || value === "1" || value === "yes";
}

/** Read a variable constrained to a fixed set of values. */
export function enumEnv<const T extends readonly string[]>(
	key: string,
	allowed: T,
	fallback: T[number],
	env: Env = process.env,
): T[number] {
	const value = env[key]?.trim();
	if (value === undefined || value === "") {
		return fallback;
	}
	if (!allowed.includes(value)) {
		throw new InvalidEnvError(key, `one of ${allowed.join(", ")}`);
	}
	return value as T[number];
}
