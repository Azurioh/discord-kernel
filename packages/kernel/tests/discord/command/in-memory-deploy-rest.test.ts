import { describe, expect, it } from "vitest";
import { createInMemoryDeployRest } from "@/discord/command/in-memory-deploy-rest";

describe("createInMemoryDeployRest", () => {
	it("records the route and body of every successful put in order", async () => {
		const rest = createInMemoryDeployRest();
		const body = [{ name: "ping" }];
		expect(rest.requests).toEqual([]);
		await expect(rest.put("/global", { body })).resolves.toBeUndefined();
		await rest.put("/guild", { body: [] });
		expect(rest.requests).toEqual([
			{ route: "/global", body },
			{ route: "/guild", body: [] },
		]);
	});
});
