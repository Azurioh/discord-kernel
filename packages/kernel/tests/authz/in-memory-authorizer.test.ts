import { describe, expect, it } from "vitest";
import { createInMemoryAuthorizer } from "@/authz/in-memory-authorizer";
import { runAuthorizerContract } from "@/authz/testing/authorizer-contract";

runAuthorizerContract("in-memory", () => createInMemoryAuthorizer(), { describe, it, expect });

describe("createInMemoryAuthorizer seeded with initial grants", () => {
	const initial = { roles: { role: "editor" as const }, users: { user: "viewer" as const } };

	it("starts from the initial grants", async () => {
		const authorizer = createInMemoryAuthorizer(initial);

		expect(await authorizer.listGrants()).toEqual(initial);
		expect(await authorizer.meetsLevel("other", ["role"], "editor")).toBe(true);
		expect(await authorizer.meetsLevel("user", ["role"], "editor")).toBe(false);
	});

	it("keeps its own copy of the initial grants", async () => {
		const seed = { roles: { role: "editor" as const }, users: {} };
		const authorizer = createInMemoryAuthorizer(seed);

		await authorizer.revokeRole("role");

		expect(seed.roles).toEqual({ role: "editor" });
	});

	it("hands out copies from listGrants", async () => {
		const authorizer = createInMemoryAuthorizer(initial);
		const listed = await authorizer.listGrants();

		listed.roles.role = "viewer";

		expect((await authorizer.listGrants()).roles).toEqual({ role: "editor" });
	});
});
