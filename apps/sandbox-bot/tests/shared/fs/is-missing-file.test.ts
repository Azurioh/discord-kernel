import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isMissingFile } from "@/shared/fs/is-missing-file";

/** The rejection of a file system call, to classify. */
async function failureOf(call: Promise<unknown>): Promise<unknown> {
	return call.then(
		() => undefined,
		(error: unknown) => error,
	);
}

describe("isMissingFile", () => {
	it("recognises a path that does not exist", async () => {
		const error = await failureOf(readFile(join(import.meta.dirname, "does-not-exist.json")));

		expect(isMissingFile(error)).toBe(true);
	});

	it("rejects any other failure", async () => {
		const error = await failureOf(readFile(import.meta.dirname));

		expect(isMissingFile(error)).toBe(false);
		expect(isMissingFile(new Error("boom"))).toBe(false);
	});
});
