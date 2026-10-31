import type { CommandDeployRest } from "@/discord/command/command-deploy-rest";

/** Deployment transport exposing each request in call order. */
export interface InMemoryDeployRest extends CommandDeployRest {
	readonly requests: readonly { readonly route: string; readonly body: unknown }[];
}

/** Record deployments in memory without calling Discord.
 * @returns A fresh deployment transport with an empty request history.
 */
export function createInMemoryDeployRest(): InMemoryDeployRest {
	const requests: { readonly route: string; readonly body: unknown }[] = [];
	return {
		get requests() {
			return [...requests];
		},
		async put(route, options) {
			requests.push({ route, body: options.body });
		},
	};
}
