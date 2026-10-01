/**
 * The error `action` rejects with, or `undefined` when it resolves. Lets a
 * contract suite assert on a rejection with the plain `ContractAssertion`
 * matchers, which have no `rejects`.
 */
export async function captureError(action: () => Promise<unknown>): Promise<unknown> {
	try {
		await action();
	} catch (error) {
		return error;
	}
	return undefined;
}
