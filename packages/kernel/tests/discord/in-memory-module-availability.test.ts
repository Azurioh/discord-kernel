import { describe, expect, it } from "vitest";
import { createInMemoryModuleAvailability } from "@/discord/in-memory-module-availability";

describe("in-memory module availability", () => {
	it("defaults available and copies initial unavailable names", () => {
		const names = ["tickets"];
		const availability = createInMemoryModuleAvailability(names);
		names.push("other");
		expect(availability.isAvailable("tickets")).toBe(false);
		expect(availability.isAvailable("other")).toBe(true);
		availability.markUnavailable("other");
		expect(availability.isAvailable("other")).toBe(false);
		expect(createInMemoryModuleAvailability().isAvailable("tickets")).toBe(true);
	});
});
