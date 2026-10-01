import type { Authorizer } from "@/authz/authorizer";
import type { DescribeFn, ExpectFn, ItFn } from "@/testing/contract-runner";

const ROLE_A = "300000000000000001";
const ROLE_B = "300000000000000002";
const USER = "200000000000000001";

/**
 * Behaviour every {@link Authorizer} implementation must have. Run it from the
 * adapter's own test file with the test runner's `describe`, `it` and `expect`:
 * `runAuthorizerContract("MyAuthorizer", createMyAuthorizer, { describe, it, expect })`.
 *
 * @param name - the implementation's name, shown in the suite title.
 * @param createAuthorizer - returns an authorizer with no grant; called once per case.
 * @param runner - the test runner's functions, so this suite imports no framework.
 */
export function runAuthorizerContract(
	name: string,
	createAuthorizer: () => Authorizer | Promise<Authorizer>,
	runner: { describe: DescribeFn; it: ItFn; expect: ExpectFn },
): void {
	const { describe, it, expect } = runner;

	describe(`Authorizer contract: ${name}`, () => {
		it("starts with no grant", async () => {
			const authorizer = await createAuthorizer();

			expect(await authorizer.listGrants()).toEqual({ roles: {}, users: {} });
			expect(await authorizer.meetsLevel(USER, [ROLE_A], "viewer")).toBe(false);
		});

		it("grants a role, and its members meet the level", async () => {
			const authorizer = await createAuthorizer();

			await authorizer.grantRole(ROLE_A, "viewer");

			expect(await authorizer.meetsLevel(USER, [ROLE_A], "viewer")).toBe(true);
			expect(await authorizer.meetsLevel(USER, [ROLE_B], "viewer")).toBe(false);
		});

		it("grants a user directly", async () => {
			const authorizer = await createAuthorizer();

			await authorizer.grantUser(USER, "editor");

			expect(await authorizer.meetsLevel(USER, [], "editor")).toBe(true);
		});

		it("lets editor meet viewer, not the reverse", async () => {
			const authorizer = await createAuthorizer();
			await authorizer.grantRole(ROLE_A, "editor");
			await authorizer.grantRole(ROLE_B, "viewer");

			expect(await authorizer.meetsLevel(USER, [ROLE_A], "viewer")).toBe(true);
			expect(await authorizer.meetsLevel(USER, [ROLE_B], "editor")).toBe(false);
		});

		it("applies the highest level among the member's roles", async () => {
			const authorizer = await createAuthorizer();
			await authorizer.grantRole(ROLE_A, "viewer");
			await authorizer.grantRole(ROLE_B, "editor");

			expect(await authorizer.meetsLevel(USER, [ROLE_A, ROLE_B], "editor")).toBe(true);
		});

		it("lets a direct user grant win over role grants, even when lower", async () => {
			const authorizer = await createAuthorizer();
			await authorizer.grantRole(ROLE_A, "editor");
			await authorizer.grantUser(USER, "viewer");

			expect(await authorizer.meetsLevel(USER, [ROLE_A], "editor")).toBe(false);
			expect(await authorizer.meetsLevel(USER, [ROLE_A], "viewer")).toBe(true);
		});

		it("revokes a role grant and reports that one existed", async () => {
			const authorizer = await createAuthorizer();
			await authorizer.grantRole(ROLE_A, "viewer");

			expect(await authorizer.revokeRole(ROLE_A)).toBe(true);
			expect(await authorizer.meetsLevel(USER, [ROLE_A], "viewer")).toBe(false);
			expect(await authorizer.revokeRole(ROLE_A)).toBe(false);
		});

		it("revokes a user grant and reports that one existed", async () => {
			const authorizer = await createAuthorizer();
			await authorizer.grantUser(USER, "viewer");

			expect(await authorizer.revokeUser(USER)).toBe(true);
			expect(await authorizer.meetsLevel(USER, [], "viewer")).toBe(false);
			expect(await authorizer.revokeUser(USER)).toBe(false);
		});

		it("reflects every change in listGrants", async () => {
			const authorizer = await createAuthorizer();
			await authorizer.grantRole(ROLE_A, "viewer");
			await authorizer.grantRole(ROLE_B, "editor");
			await authorizer.grantUser(USER, "editor");
			await authorizer.grantRole(ROLE_A, "editor");
			await authorizer.revokeRole(ROLE_B);

			expect(await authorizer.listGrants()).toEqual({
				roles: { [ROLE_A]: "editor" },
				users: { [USER]: "editor" },
			});
		});
	});
}
