import { describe, expect, it } from "vitest";
import { createInMemoryLogger } from "@/in-memory-logger";

const LEVELS = ["trace", "debug", "info", "warn", "error", "fatal"] as const;

describe("createInMemoryLogger", () => {
	it.each(LEVELS)("appends a %s entry for a record and a message", (level) => {
		const logger = createInMemoryLogger();

		logger[level]({ job: "sync" }, "Job ran");

		expect(logger.entries).toEqual([{ level, fields: { job: "sync" }, message: "Job ran" }]);
	});

	it.each(LEVELS)("appends a %s entry for a bare message", (level) => {
		const logger = createInMemoryLogger();

		logger[level]("Ready");

		expect(logger.entries).toEqual([{ level, fields: {}, message: "Ready" }]);
	});

	it("appends a record logged without a message", () => {
		const logger = createInMemoryLogger();

		logger.info({ guildId: "1" });

		expect(logger.entries).toEqual([{ level: "info", fields: { guildId: "1" } }]);
	});

	it("keeps the entries in call order", () => {
		const logger = createInMemoryLogger();

		logger.info("first");
		logger.error("second");

		expect(logger.entries.map((entry) => entry.message)).toEqual(["first", "second"]);
	});

	it("merges a child's bindings into its entries and lands them in the parent's", () => {
		const logger = createInMemoryLogger();
		const child = logger.child({ module: "tickets" });

		child.warn({ guildId: "1" }, "Slow");
		child.child({ job: "sync" }).info("Done");

		expect(logger.entries).toEqual([
			{ level: "warn", fields: { module: "tickets", guildId: "1" }, message: "Slow" },
			{ level: "info", fields: { module: "tickets", job: "sync" }, message: "Done" },
		]);
	});

	it("lets the record override a binding of the same name", () => {
		const logger = createInMemoryLogger();

		logger.child({ module: "tickets" }).info({ module: "welcome" }, "Moved");

		expect(logger.entries[0]?.fields).toEqual({ module: "welcome" });
	});
});
