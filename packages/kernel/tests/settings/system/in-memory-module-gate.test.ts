import { describe, expect, it } from "vitest";
import { createInMemoryModuleGate } from "@/settings/system/in-memory-module-gate";

describe("createInMemoryModuleGate", () => {
	it("enables every module when nothing is disabled", async () => {
		await expect(createInMemoryModuleGate().isEnabled("tickets", "guild")).resolves.toBe(true);
	});

	it("honours the seeded disabled modules, per guild", async () => {
		const gate = createInMemoryModuleGate({ guild: ["tickets"] });

		await expect(gate.isEnabled("tickets", "guild")).resolves.toBe(false);
		await expect(gate.isEnabled("welcome", "guild")).resolves.toBe(true);
		await expect(gate.isEnabled("tickets", "other")).resolves.toBe(true);
	});

	it("disables a module on one guild only", async () => {
		const gate = createInMemoryModuleGate();

		gate.disable("tickets", "guild");

		await expect(gate.isEnabled("tickets", "guild")).resolves.toBe(false);
		await expect(gate.isEnabled("tickets", "other")).resolves.toBe(true);
	});

	it("enables a module again on one guild only", async () => {
		const gate = createInMemoryModuleGate({ guild: ["tickets"], other: ["tickets"] });

		gate.enable("tickets", "guild");

		await expect(gate.isEnabled("tickets", "guild")).resolves.toBe(true);
		await expect(gate.isEnabled("tickets", "other")).resolves.toBe(false);
	});

	it("keeps its own copy of the seed", async () => {
		const seed = { guild: ["tickets"] };
		const gate = createInMemoryModuleGate(seed);

		gate.enable("tickets", "guild");

		expect(seed).toEqual({ guild: ["tickets"] });
	});
});
