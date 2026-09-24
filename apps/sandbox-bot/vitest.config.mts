import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: { tsconfigPaths: true },
	test: {
		environment: "node",
		include: ["tests/**/*.test.ts"],
		clearMocks: true,
		// The kernel is a symlinked workspace package, which Vitest would inline.
		// Load its built CommonJS through Node instead, as for any installed
		// dependency, so each kernel module exists once and `instanceof` holds.
		server: { deps: { external: [/\/packages\/kernel\/dist\//] } },
	},
});
