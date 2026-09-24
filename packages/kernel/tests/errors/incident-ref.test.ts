import { describe, expect, it } from "vitest";
import { createIncidentRef } from "@/errors/incident-ref";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("createIncidentRef", () => {
	it("produces a v4 UUID", () => {
		expect(createIncidentRef()).toMatch(UUID_V4);
	});

	it("is effectively unique across calls", () => {
		const refs = new Set(Array.from({ length: 500 }, () => createIncidentRef()));
		expect(refs.size).toBe(500);
	});
});
