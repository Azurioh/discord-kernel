import { systemClock } from "@azurioh/discord-kernel/clock";
import { AutocompleteDispatcher } from "@azurioh/discord-kernel/discord/command/autocomplete-dispatcher";
import { CommandRouter } from "@azurioh/discord-kernel/discord/command/router";
import { ComponentRouter } from "@azurioh/discord-kernel/discord/components/component-router";
import { createEvent } from "@azurioh/discord-kernel/discord/events/create-event";
import { EventRouter } from "@azurioh/discord-kernel/discord/events/event-router";
import { CORE_CATALOG } from "@azurioh/discord-kernel/discord/i18n";
import { InteractionRouter } from "@azurioh/discord-kernel/discord/interaction/interaction-router";
import { createDiscordGuildDirectory } from "@azurioh/discord-kernel/discord/settings/discord-guild-directory";
import { TranslationRegistry } from "@azurioh/discord-kernel/i18n/catalog";
import { createTranslator } from "@azurioh/discord-kernel/i18n/translator";
import type { Logger } from "@azurioh/discord-kernel/logger";
import type { BotModule } from "@azurioh/discord-kernel/module/module";
import {
	createInProcessNotifier,
	createSettingsRegistry,
	createSettingsService,
	SETTINGS_CATALOG,
} from "@azurioh/discord-kernel/settings";
import { Client, GatewayIntentBits } from "discord.js";
import { createSettingsStore } from "@/bootstrap/create-settings-store";
import { PAGINATOR_CATALOG } from "@/components/paginator/i18n/paginator.catalog";
import type { SandboxConfig } from "@/config";
import { createBasicsModule } from "@/modules/basics/basics.module";
import { createDemoModule } from "@/modules/demo/demo.module";
import { createEmbedPresenter } from "@/shared/discord/embed-presenter";

/** The wired bot: a client with every listener bound, and the commands to deploy. */
export interface Sandbox {
	readonly client: Client;
	readonly commands: CommandRouter;
}

/**
 * The composition root: build the kernel's services, collect the modules'
 * catalogs, settings, commands and events, and bind them to one client.
 *
 * @param config - the environment-derived configuration.
 * @param logger - the application logger, shared with the kernel's services.
 * @returns the wired sandbox; nothing is connected until `client.login`.
 * @throws DuplicateTranslationKeyError or SettingsDeclarationError when the
 * modules' catalogs or declarations are inconsistent.
 */
export function createSandbox(config: SandboxConfig, logger: Logger): Sandbox {
	const translations = new TranslationRegistry();
	translations.register(CORE_CATALOG);
	translations.register(SETTINGS_CATALOG);
	// The app-owned components carry their own wording.
	translations.register(PAGINATOR_CATALOG);
	const translator = createTranslator(translations, { defaultLocale: "en", logger });
	const presenter = createEmbedPresenter(translator);
	// Guilds only: no privileged intent to enable in the developer portal.
	const client = new Client({ intents: [GatewayIntentBits.Guilds] });
	const guildIds = [config.devGuildId];

	const modules: readonly BotModule[] = [
		createBasicsModule({ guildIds, logger }),
		createDemoModule({ guildIds, translator, logger, settings: () => settings }),
	];
	for (const module of modules) {
		if (module.translations) {
			translations.register(module.translations);
		}
	}

	const notifier = createInProcessNotifier(logger);
	notifier.subscribe((event) => {
		logger.info({ ...event }, "Settings changed");
	});
	const settings = createSettingsService({
		registry: createSettingsRegistry({
			declarations: modules.flatMap((module) => module.settings ?? []),
			translations,
		}),
		store: createSettingsStore(config.settingsStore),
		guilds: createDiscordGuildDirectory(client),
		notifier,
		translator,
		clock: systemClock,
		logger,
	});

	const runtime = { presenter, logger, translator };
	const commands = new CommandRouter(runtime).registerAll(
		modules.flatMap((module) => module.commands ?? []),
	);
	const components = new ComponentRouter(runtime).registerAll(
		modules.flatMap((module) => module.components ?? []),
	);
	const interactions = new InteractionRouter([
		commands,
		new AutocompleteDispatcher(commands, logger),
		components,
	]);

	new EventRouter(logger)
		.registerAll(modules.flatMap((module) => module.events ?? []))
		.register(
			createEvent({
				name: "interactionCreate",
				execute: (interaction) => interactions.dispatch(interaction),
			}),
		)
		.bind(client);

	return { client, commands };
}
