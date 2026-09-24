import type { Context } from "@azurioh/discord-kernel/discord/command/context";
import type { Options } from "@azurioh/discord-kernel/discord/command/options";
import { SettingsValidationError } from "@azurioh/discord-kernel/settings";
import { DEMO_MESSAGES } from "@/modules/demo/demo-catalog";

/** Show a rejected submission: every issue, each in the administrator's language. */
async function replyWithIssues<O extends Options>(
	ctx: Context<O>,
	error: SettingsValidationError,
): Promise<void> {
	const issues = error.issues
		.map(
			(issue) => `• \`${issue.field}\`: ${ctx.t(issue.translation.key, issue.translation.params)}`,
		)
		.join("\n");
	await ctx.error(ctx.t(DEMO_MESSAGES.rejected, { issues }));
}

/**
 * Run a settings write and confirm with the text it returns. A rejected
 * submission is answered with its issues instead; any other failure goes on
 * to the command pipeline.
 */
export async function confirmOrReportIssues<O extends Options>(
	ctx: Context<O>,
	write: () => Promise<string>,
): Promise<void> {
	let confirmation: string;
	try {
		confirmation = await write();
	} catch (error) {
		if (error instanceof SettingsValidationError) {
			await replyWithIssues(ctx, error);
			return;
		}
		throw error;
	}
	await ctx.confirm(confirmation);
}
