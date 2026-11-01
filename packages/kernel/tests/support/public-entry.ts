import { join } from "node:path";
import packageManifest from "../../package.json";

/** Resolve an explicit public script export to its source for tests before build.
 * @param subpath - Public export key, including the leading ./.
 * @returns Absolute path of the exported source file.
 * @throws TypeError when the entry is not a script export.
 */
export function publicEntrySource(subpath: keyof typeof packageManifest.exports): string {
	const target = packageManifest.exports[subpath];
	if (typeof target === "string") {
		throw new TypeError("Expected a public script entry");
	}
	return join(
		__dirname,
		"../..",
		target.default.replace("./dist/", "src/").replace(/\.js$/, ".ts"),
	);
}
