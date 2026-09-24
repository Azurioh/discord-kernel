import { randomUUID } from "node:crypto";

/**
 * Generate a unique incident reference attached to unexpected errors. The same
 * value is logged server-side and shown to the user, so a support request can be
 * traced back to a single log line.
 */
export function createIncidentRef(): string {
	return randomUUID();
}
