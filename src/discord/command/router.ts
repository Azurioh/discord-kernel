import { type Interaction, REST, Routes } from "discord.js";
import type {
	CommandRuntime,
	ContextMenuCommand,
	DeployableCommand,
	SlashCommand,
} from "@/discord/command/types";
import type { InteractionDispatcher } from "@/discord/interaction/interaction-router";
import type { Presenter } from "@/discord/presenter";
import type { Translator } from "@/i18n";
import type { Logger } from "@/logger";

export interface CommandRouterDeps {
	presenter: Presenter;
	logger: Logger;
	translator: Translator;
}

/**
 * Owns the registered slash commands and dispatches chat-input interactions to
 * them, injecting the shared {@link CommandRuntime}. Also registers the command
 * definitions with Discord's API. It does not attach its own listener — it is an
 * {@link InteractionDispatcher} driven by the shared {@link InteractionRouter}.
 */
export class CommandRouter implements InteractionDispatcher {
	private readonly commands = new Map<string, SlashCommand>();
	private readonly contextMenuCommands = new Map<string, ContextMenuCommand>();
	private readonly runtime: CommandRuntime;

	constructor(private readonly deps: CommandRouterDeps) {
		this.runtime = {
			presenter: deps.presenter,
			logger: deps.logger,
			translator: deps.translator,
		};
	}

	/** Register a command (last registration of a name wins). */
	register(command: SlashCommand): this {
		this.commands.set(command.data.name, command);
		return this;
	}

	/** Register many commands at once. */
	registerAll(commands: Iterable<SlashCommand>): this {
		for (const command of commands) {
			this.register(command);
		}
		return this;
	}

	/**
	 * Register a context-menu entry. Kept in its own map because Discord treats a
	 * slash command and a context-menu entry as distinct application command
	 * types, and therefore lets them share a name.
	 */
	registerContextMenu(command: ContextMenuCommand): this {
		this.contextMenuCommands.set(command.data.name, command);
		return this;
	}

	registerAllContextMenus(commands: Iterable<ContextMenuCommand>): this {
		for (const command of commands) {
			this.registerContextMenu(command);
		}
		return this;
	}

	/** Look up a registered slash command, for dispatchers that share this registry. */
	get(name: string): SlashCommand | undefined {
		return this.commands.get(name);
	}

	/** Claim and dispatch chat-input and context-menu commands; ignore everything else. */
	async handle(interaction: Interaction): Promise<boolean> {
		if (interaction.isChatInputCommand()) {
			const command = this.commands.get(interaction.commandName);
			if (!command) {
				return false;
			}
			await command.dispatch(interaction, this.runtime);
			return true;
		}

		if (interaction.isContextMenuCommand()) {
			const command = this.contextMenuCommands.get(interaction.commandName);
			if (!command) {
				return false;
			}
			await command.dispatch(interaction, this.runtime);
			return true;
		}

		return false;
	}

	/**
	 * Push every registered command to its declared scope: commands with
	 * `guildIds` go to those guild(s) (instant availability), the rest are
	 * deployed globally (available on every server, slower to propagate). The
	 * global scope is always synced — even when empty — so stale global commands
	 * are pruned. Returns the number of commands deployed.
	 */
	async deployCommands(token: string, clientId: string): Promise<number> {
		const rest = new REST({ version: "10" }).setToken(token);
		const global: unknown[] = [];
		const byGuild = new Map<string, unknown[]>();
		let deployed = 0;

		const all: DeployableCommand[] = [
			...this.commands.values(),
			...this.contextMenuCommands.values(),
		];

		for (const command of all) {
			const body = command.data.toJSON ? command.data.toJSON() : null;
			if (body === null) {
				continue;
			}
			deployed += 1;
			if (command.guildIds && command.guildIds.length > 0) {
				for (const guildId of command.guildIds) {
					const bucket = byGuild.get(guildId) ?? [];
					bucket.push(body);
					byGuild.set(guildId, bucket);
				}
			} else {
				global.push(body);
			}
		}

		await rest.put(Routes.applicationCommands(clientId), { body: global });
		this.deps.logger.info({ count: global.length }, "Global slash commands deployed");

		for (const [guildId, body] of byGuild) {
			await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body });
			this.deps.logger.info({ guildId, count: body.length }, "Guild slash commands deployed");
		}

		return deployed;
	}
}
