import type { Option, Options } from "@/discord/command/options";

type AsRequired<O> = O extends Option<infer V, boolean> ? Option<V, true> : never;

/** Turn every option in a record into its required variant. */
export function allRequired<O extends Options>(fields: O): { [K in keyof O]: AsRequired<O[K]> } {
	const out = {} as { [K in keyof O]: AsRequired<O[K]> };
	for (const [key, option] of Object.entries(fields)) {
		out[key as keyof O] = option.required() as AsRequired<O[keyof O]>;
	}
	return out;
}
