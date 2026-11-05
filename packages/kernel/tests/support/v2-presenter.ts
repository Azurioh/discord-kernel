import type { Presenter } from "@/discord/presenter";
import type { View } from "@/discord/view/view";

/** A one-container V2 view whose single text reads `<kind>: <message>`. */
function v2Text(content: string): View {
	return { components: [{ type: "container", children: [{ type: "text", content }] }] };
}

/** A {@link Presenter} answering every kind in Components V2, for tests of kernel reply paths.
 * @returns A presenter whose system error text also carries the incident reference.
 */
export function createV2Presenter(): Presenter {
	return {
		confirmation: (message) => v2Text(`confirmation: ${message}`),
		warning: (message) => v2Text(`warning: ${message}`),
		error: (message) => v2Text(`error: ${message}`),
		denial: (message) => v2Text(`denial: ${message}`),
		systemError: (message, reference) => v2Text(`systemError: ${message} (${reference})`),
	};
}
