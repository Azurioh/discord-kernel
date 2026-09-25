import type { CommandInteraction } from "discord.js";
import { sendEmbed } from "@/discord/command/send-embed";
import type { CommandRuntime } from "@/discord/command/types";
import { CORE_MESSAGES } from "@/discord/i18n";
import { replyLocale } from "@/discord/interaction/reply-locale";
import { BusinessError } from "@/errors/business-error";
import { errorMessage } from "@/errors/error-message";
import { createIncidentRef } from "@/errors/incident-ref";
import { resolveBusinessMessage } from "@/i18n/business-message";
import type { LocalizedText } from "@/i18n/translator";

/** How one command pipeline wants a failed handler reported. */
export interface CommandFailure {
	readonly error: unknown;
	/** Whether the answer is ephemeral, as the command declared. */
	readonly ephemeral: boolean;
	/** Shown instead of the generic message for an unexpected error. */
	readonly fallbackError?: LocalizedText;
	/** Extra fields identifying the route in the incident log. */
	readonly logFields?: Readonly<Record<string, unknown>>;
	/** The incident log's message. */
	readonly logMessage: string;
}

/**
 * Answer a handler that threw. A {@link BusinessError} is user feedback: its
 * own (translated) message, as a warning or an error by its severity, with no
 * incident minted. Anything else is an incident: logged with a fresh
 * reference, and answered with the fallback message carrying that reference.
 */
export async function renderCommandFailure(
	interaction: CommandInteraction,
	failure: CommandFailure,
	runtime: CommandRuntime,
): Promise<void> {
	const { presenter, logger, translator } = runtime;
	const { error, ephemeral } = failure;
	const locale = await replyLocale(interaction, runtime);
	if (error instanceof BusinessError) {
		const text = resolveBusinessMessage(error, translator, locale);
		const embed =
			error.severity === "warning"
				? presenter.warning(text, locale)
				: presenter.error(text, locale);
		await sendEmbed(interaction, embed, ephemeral, logger);
		return;
	}

	const ref = createIncidentRef();
	logger.error(
		{
			command: interaction.commandName,
			...failure.logFields,
			userId: interaction.user.id,
			ref,
			err: errorMessage(error),
			stack: error instanceof Error ? error.stack : undefined,
		},
		failure.logMessage,
	);
	await sendEmbed(
		interaction,
		presenter.systemError(
			translator.resolve(locale, failure.fallbackError ?? { key: CORE_MESSAGES.genericError }),
			ref,
			locale,
		),
		ephemeral,
		logger,
	);
}
