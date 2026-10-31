import { Client, Events, GatewayIntentBits } from "discord.js";
import { assembleModules, buildModules } from "@/bot/assemble-modules";
import { BotLifecycle } from "@/bot/lifecycle";
import { LifecycleDispatcher } from "@/bot/lifecycle-dispatcher";
import { ModuleStatus } from "@/bot/module-status";
import type { ProcessLike } from "@/bot/process-like";
import type { StopReport } from "@/bot/stop-report";
import { type Clock, systemClock } from "@/clock";
import { AutocompleteDispatcher } from "@/discord/command/autocomplete-dispatcher";
import type { CommandDeployRest } from "@/discord/command/command-deploy-rest";
import { CommandRouter } from "@/discord/command/router";
import { ComponentRouter } from "@/discord/components/component-router";
import { createDefaultPresenter } from "@/discord/default-presenter";
import { EventRouter } from "@/discord/events/event-router";
import { InteractionRouter } from "@/discord/interaction/interaction-router";
import type { LocaleResolver } from "@/discord/interaction/locale-resolver";
import type { Presenter } from "@/discord/presenter";
import { createDiscordGuildDirectory } from "@/discord/settings/discord-guild-directory";
import { createGuildLocaleResolver } from "@/discord/settings/guild-locale-resolver";
import { SOURCE_LOCALE } from "@/i18n/locale";
import { createTranslator } from "@/i18n/translator";
import type { Logger } from "@/logger";
import type { BotModule } from "@/module/module";
import type { BotServices } from "@/module/module-context";
import type { DatabaseConnection } from "@/persistence/database";
import type { MigrationRunner } from "@/persistence/migration-runner";
import { CronScheduler, type Scheduler } from "@/scheduler/scheduler";
import { createInProcessNotifier } from "@/settings/in-memory/in-process-notifier";
import type { GuildDirectory } from "@/settings/ports/guild-directory";
import type { SettingsChangedNotifier } from "@/settings/ports/settings-changed-notifier";
import type { SettingsStore } from "@/settings/ports/settings-store";
import { createSettingsService } from "@/settings/settings-service";
import { createModuleGate } from "@/settings/system/module-gate";

/** Modules and adapters used to assemble and run a bot. */
export interface BotOptions {
	readonly modules: readonly BotModule[];
	readonly logger: Logger;
	readonly settingsStore: SettingsStore;
	readonly adapters?: {
		readonly presenter?: Presenter;
		readonly localeResolver?: (services: BotServices) => LocaleResolver;
		readonly scheduler?: Scheduler;
		readonly migrations?: MigrationRunner;
		readonly databases?: readonly DatabaseConnection[];
		readonly guilds?: GuildDirectory;
		readonly notifier?: SettingsChangedNotifier;
		readonly clock?: Clock;
	};
	readonly lifecycle?: {
		readonly shutdownTimeoutMs?: number;
		readonly handleSignals?: boolean;
		readonly handleCrashes?: boolean;
		readonly flushes?: readonly NamedFlush[];
		readonly process?: ProcessLike;
	};
	readonly discord?: {
		readonly client?: Client;
		readonly intents?: readonly GatewayIntentBits[];
	};
}

/** Deployment credentials and an optional transport that replaces Discord REST. */
export interface DeployTarget {
	readonly token: string;
	readonly clientId: string;
	readonly rest?: CommandDeployRest;
}

/** A named final log or telemetry flush. */
export interface NamedFlush {
	readonly name: string;
	flush(): Promise<void> | void;
}

/** Observable lifecycle phases of a bot. */
export type BotState = "created" | "starting" | "running" | "stopping" | "stopped";

/** An assembled bot with ordered startup and graceful shutdown. */
export interface Bot extends BotServices {
	readonly state: BotState;
	stop(): Promise<StopReport>;
	start(token: string): Promise<void>;
	deployCommands(target: DeployTarget): Promise<number>;
}

/** Assemble kernel services and module handlers without logging in or running setup.
 * @param options - Modules, logger, settings store and optional adapter overrides.
 * @returns A bot ready to deploy commands or log in.
 * @throws DuplicateModuleError for repeated names.
 * @throws ModuleRegistrationError for invalid module contributions.
 */
export function createBot(options: BotOptions): Bot {
	const { translations, registry } = assembleModules(options.modules);
	const client =
		options.discord?.client ??
		new Client({
			intents: [...(options.discord?.intents ?? [GatewayIntentBits.Guilds])],
		});
	const logger = options.logger;
	const translator = createTranslator(translations, { defaultLocale: SOURCE_LOCALE, logger });
	const clock = options.adapters?.clock ?? systemClock;
	const notifier = options.adapters?.notifier ?? createInProcessNotifier(logger);
	const subscriptions: (() => void)[] = [];
	try {
		const settings = createSettingsService({
			registry,
			store: options.settingsStore,
			translator,
			logger,
			clock,
			guilds: options.adapters?.guilds ?? createDiscordGuildDirectory(client),
			notifier: {
				notify: notifier.notify.bind(notifier),
				subscribe(listener) {
					const unsubscribe = notifier.subscribe(listener);
					subscriptions.push(unsubscribe);
					return unsubscribe;
				},
			},
		});
		const gate = createModuleGate({ service: settings, registry, logger });
		const presenter = options.adapters?.presenter ?? createDefaultPresenter(translator);
		const services: BotServices = {
			client,
			logger,
			translator,
			registry,
			settings,
			gate,
			presenter,
			clock,
		};
		const localeResolver =
			options.adapters?.localeResolver?.(services) ??
			createGuildLocaleResolver({ service: settings, registry, translator });
		const modules = buildModules({ modules: options.modules, services });
		const availability = new ModuleStatus(modules);
		const lifecycle = new BotLifecycle({
			client,
			logger,
			modules,
			statuses: availability,
			scheduler: options.adapters?.scheduler ?? new CronScheduler(logger),
			databases: options.adapters?.databases ?? [],
			migrations: options.adapters?.migrations,
			options: options.lifecycle,
			subscriptions,
		});
		const deps = { logger, translator, presenter, gate, localeResolver, availability };
		const commands = new CommandRouter(deps);
		const components = new ComponentRouter(deps);
		const events = new EventRouter(logger, gate, availability);
		for (const module of modules) {
			const moduleName = module.name;
			commands.registerAll(module.commands ?? [], moduleName, module.gated !== false);
			commands.registerAllContextMenus(
				module.contextMenuCommands ?? [],
				moduleName,
				module.gated !== false,
			);
			components.registerAll(module.components ?? [], moduleName, module.gated !== false);
			events.registerAll(module.events ?? [], moduleName, module.gated !== false);
		}
		const interactions = new InteractionRouter([
			new LifecycleDispatcher({ ...deps, state: () => lifecycle.state }),
			commands,
			new AutocompleteDispatcher(
				{
					get: commands.get.bind(commands),
					gated(command) {
						for (const module of modules) {
							if (module.commands?.includes(command)) {
								return module.gated !== false;
							}
						}
						return true;
					},
					moduleName(command) {
						let owner: BotModule | undefined;
						for (const module of modules) {
							if (module.commands?.includes(command)) {
								owner = module;
							}
						}
						return owner?.name;
					},
				},
				logger,
				gate,
				availability,
			),
			components,
		]);
		client.on(Events.InteractionCreate, (interaction) => interactions.dispatch(interaction));
		events.bind(client);
		return {
			...services,
			get state() {
				return lifecycle.state;
			},
			start: lifecycle.start.bind(lifecycle),
			stop: lifecycle.stop.bind(lifecycle),
			deployCommands(target) {
				return commands.deployCommands(target.token, target.clientId, target.rest);
			},
		};
	} catch (error) {
		for (const unsubscribe of subscriptions) {
			unsubscribe();
		}
		throw error;
	}
}
