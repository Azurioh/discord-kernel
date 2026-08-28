/**
 * Failures raised while reading environment variables. They live apart from the
 * reading logic so a consumer can catch or re-map them without pulling in the
 * `env` helpers, and so the helpers file stays focused on behaviour.
 */

/** Raised when a required environment variable is missing or empty. */
export class MissingEnvError extends Error {
	constructor(key: string) {
		super(`Missing required environment variable: ${key}`);
		this.name = "MissingEnvError";
	}
}

/** Raised when an environment variable holds an invalid value. */
export class InvalidEnvError extends Error {
	constructor(key: string, expected: string) {
		super(`Invalid environment variable ${key}: expected ${expected}`);
		this.name = "InvalidEnvError";
	}
}
