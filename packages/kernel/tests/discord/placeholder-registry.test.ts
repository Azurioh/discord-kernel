import { describe, expect, it } from "vitest";
import { type PlaceholderProvider, PlaceholderRegistry } from "@/discord/placeholder-registry";
import { DuplicatePlaceholderTokenError } from "@/discord/placeholder-registry-errors";

function aProvider(token: string, value: string, legendKey = "test.legend"): PlaceholderProvider {
	return { token, legendKey, resolve: async () => value };
}

describe("PlaceholderRegistry", () => {
	it("starts empty", () => {
		const registry = new PlaceholderRegistry();

		expect(registry.list()).toEqual([]);
		expect(registry.tokens()).toEqual([]);
	});

	it("lists every registered provider, in the order it was registered", () => {
		const registry = new PlaceholderRegistry();
		const first = aProvider("{a}", "A");
		const second = aProvider("{b}", "B");

		registry.register(first);
		registry.register(second);

		expect(registry.list()).toEqual([first, second]);
		expect(registry.tokens()).toEqual(["{a}", "{b}"]);
	});

	it("refuses a second provider for a token already registered", () => {
		const registry = new PlaceholderRegistry();
		registry.register(aProvider("{a}", "A"));

		expect(() => registry.register(aProvider("{a}", "A again"))).toThrow(
			DuplicatePlaceholderTokenError,
		);
	});

	it("replaces every occurrence of a registered token", async () => {
		const registry = new PlaceholderRegistry();
		registry.register(aProvider("{a}", "A"));

		await expect(registry.resolve("{a}, {a}!", "guild-1", "en")).resolves.toBe("A, A!");
	});

	it("leaves text carrying no registered token exactly as it is", async () => {
		const registry = new PlaceholderRegistry();
		registry.register(aProvider("{a}", "A"));

		await expect(registry.resolve("Nothing to resolve here.", "guild-1", "en")).resolves.toBe(
			"Nothing to resolve here.",
		);
	});

	it("never asks a provider whose token is absent from the text to resolve", async () => {
		const registry = new PlaceholderRegistry();
		let asked = false;
		registry.register({
			token: "{a}",
			legendKey: "test.legend",
			resolve: async () => {
				asked = true;
				return "A";
			},
		});

		await registry.resolve("Nothing to resolve here.", "guild-1", "en");

		expect(asked).toBe(false);
	});

	it("resolves several registered tokens in the same text", async () => {
		const registry = new PlaceholderRegistry();
		registry.register(aProvider("{a}", "A"));
		registry.register(aProvider("{b}", "B"));

		await expect(registry.resolve("{a} and {b}", "guild-1", "en")).resolves.toBe("A and B");
	});

	/**
	 * A provider is asked once, live, at every call — never cached across
	 * `resolve` calls — which is what lets a value that changed between the two
	 * calls (a request field added to a guild's settings) show up without the
	 * text itself being touched.
	 */
	it("asks the provider again on every resolve, rather than caching its answer", async () => {
		const registry = new PlaceholderRegistry();
		let current = "first";
		registry.register({ token: "{a}", legendKey: "test.legend", resolve: async () => current });

		await expect(registry.resolve("{a}", "guild-1", "en")).resolves.toBe("first");
		current = "second";
		await expect(registry.resolve("{a}", "guild-1", "en")).resolves.toBe("second");
	});
});
