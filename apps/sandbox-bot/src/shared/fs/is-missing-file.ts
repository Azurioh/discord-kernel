/** Whether a file system call failed because the path does not exist (`ENOENT`). */
export function isMissingFile(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}
