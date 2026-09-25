import type { ModuleGate } from "@/settings/system/module-gate";

/**
 * Whether a router must skip a handler because its module is disabled on the
 * guild it runs for. Nothing is gated without a gate, for a handler registered
 * without a module, or outside a guild (FR-036).
 *
 * @param params.gate - the bot's module gate, if the router was given one.
 * @param params.moduleName - the module that registered the handler.
 * @param params.guildId - the guild the handler would run for, `null` outside one.
 */
export async function isModuleDisabled(params: {
	gate: ModuleGate | undefined;
	moduleName: string | undefined;
	guildId: string | null | undefined;
}): Promise<boolean> {
	const { gate, moduleName, guildId } = params;
	if (gate === undefined || moduleName === undefined || !guildId) {
		return false;
	}
	return !(await gate.isEnabled(moduleName, guildId));
}
