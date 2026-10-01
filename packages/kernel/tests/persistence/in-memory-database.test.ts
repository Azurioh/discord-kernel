import { describe, expect, it } from "vitest";
import { createInMemoryDatabase } from "@/persistence/in-memory-database";

describe("createInMemoryDatabase", () => {
	it("names its driver in-memory by default, or as given", () => {
		expect(createInMemoryDatabase().driver).toBe("in-memory");
		expect(createInMemoryDatabase("mongo").driver).toBe("mongo");
	});

	it("starts closed, with no call counted", () => {
		const database = createInMemoryDatabase();

		expect(database.connected).toBe(false);
		expect(database.connectCount).toBe(0);
		expect(database.closeCount).toBe(0);
	});

	it("counts every connect, and stays connected when called again", async () => {
		const database = createInMemoryDatabase();

		await database.connect();
		await database.connect();

		expect(database.connected).toBe(true);
		expect(database.connectCount).toBe(2);
	});

	it("counts close and marks the database closed", async () => {
		const database = createInMemoryDatabase();
		await database.connect();

		await database.close();

		expect(database.connected).toBe(false);
		expect(database.closeCount).toBe(1);
	});

	it("rejects the next connect with the error given to failOnConnect", async () => {
		const database = createInMemoryDatabase();
		const failure = new Error("unreachable");
		database.failOnConnect(failure);

		await expect(database.connect()).rejects.toBe(failure);
		expect(database.connected).toBe(false);
		expect(database.connectCount).toBe(1);
	});

	it("connects again once the failure was consumed", async () => {
		const database = createInMemoryDatabase();
		database.failOnConnect(new Error("unreachable"));
		await database.connect().catch(() => undefined);

		await database.connect();

		expect(database.connected).toBe(true);
	});
});
