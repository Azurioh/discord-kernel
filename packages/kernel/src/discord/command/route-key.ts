/**
 * The key a subcommand is stored and looked up under. Its own module because
 * dispatch and autocomplete must agree on it: if they ever built it
 * differently, an autocomplete inside a group would silently resolve to no
 * options instead of failing loudly.
 */
export function routeKey(group: string | null, name: string): string {
	return group ? `${group}/${name}` : name;
}
