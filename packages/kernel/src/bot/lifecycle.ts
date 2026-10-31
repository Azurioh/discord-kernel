import { type Client, Events } from "discord.js";
import type { BotOptions, BotState } from "@/bot/create-bot";
import { runStep } from "@/bot/lifecycle-step";
import type { ModuleStatus } from "@/bot/module-status";
import { installProcessHandlers } from "@/bot/process-handlers";
import type { StopReason, StopReport } from "@/bot/stop-report";
import { systemClock } from "@/clock";
import { errorMessage } from "@/errors/error-message";
import type { Logger } from "@/logger";
import type { BotModule } from "@/module/module";
import type { DatabaseConnection } from "@/persistence/database";
import type { MigrationRunner } from "@/persistence/migration-runner";
import type { ScheduledJob, Scheduler } from "@/scheduler/scheduler";

const SHUTDOWN_TIMEOUT_MS = 10_000;
const SHUTDOWN_GRACE_MS = 1_000;

type ShutdownBudget = {
	deadline: number;
	graceDeadline: number;
	failed: { step: string; target?: string; error: string }[];
	abandoned: { step: string; target?: string }[];
};

/** Own startup acquisitions and release them once, within one shutdown budget. */
export class BotLifecycle {
	private currentState: BotState = "created";
	private startup: Promise<void> | undefined;
	private stopping: Promise<StopReport> | undefined;
	private readonly connected: DatabaseConnection[] = [];
	private loginCalled = false;
	private cleanupBudget: ShutdownBudget | undefined;
	private cancelReady: (() => void) | undefined;
	private removeHandlers: (() => void) | undefined;
	private notifyStop: (() => void) | undefined;
	private readonly stopRequested = new Promise<void>((resolve) => {
		this.notifyStop = resolve;
	});

	constructor(
		private readonly deps: {
			client: Client;
			logger: Logger;
			modules: readonly BotModule[];
			statuses: ModuleStatus;
			scheduler: Scheduler;
			databases: readonly DatabaseConnection[];
			migrations?: MigrationRunner;
			options: BotOptions["lifecycle"];
			subscriptions: readonly (() => void)[];
		},
	) {}

	/** Current externally visible lifecycle phase. */
	get state(): BotState {
		return this.currentState;
	}

	/** Start once; interruption by stop resolves after cleanup, while failures reject.
	 * @param token - Discord login token.
	 * @returns Completion of startup or requested shutdown.
	 * @throws The original required startup step error, after cleanup.
	 */
	async start(token: string): Promise<void> {
		if (this.currentState !== "created") {
			this.deps.logger.warn({ state: this.currentState }, "Bot start ignored");
			return;
		}
		this.currentState = "starting";
		this.removeHandlers = installProcessHandlers({
			process: this.deps.options?.process ?? {
				on: process.on.bind(process),
				off: process.off.bind(process),
				exit: process.exit.bind(process),
				get exitCode() {
					return process.exitCode ?? undefined;
				},
				set exitCode(value) {
					process.exitCode = value;
				},
			},
			logger: this.deps.logger,
			handleSignals: this.deps.options?.handleSignals ?? true,
			handleCrashes: this.deps.options?.handleCrashes ?? true,
			stop: this.stop.bind(this),
		});
		this.startup = this.startSequence(token);
		try {
			await Promise.race([this.startup, this.stopRequested]);
		} catch (error) {
			await this.stop("startFailure");
			throw error;
		}
		if (this.stopping !== undefined) {
			await this.stopping;
		}
	}

	/** Request a single shutdown, retaining its report for all callers.
	 * @param reason - Shutdown initiator.
	 * @param signal - Optional initiating process signal.
	 * @returns The same shutdown promise on repeated calls.
	 */
	stop(reason: StopReason = "manual", signal?: string): Promise<StopReport> {
		if (this.stopping !== undefined) {
			return this.stopping;
		}
		this.currentState = "stopping";
		this.cancelReady?.();
		this.stopping = this.stopSequence({ reason, signal });
		this.notifyStop?.();
		return this.stopping;
	}

	private async startSequence(token: string): Promise<void> {
		for (const database of this.deps.databases) {
			if (this.currentState !== "starting") {
				return;
			}
			await runStep("databases.connect", () => database.connect(), {
				logger: this.deps.logger,
				target: database.driver,
			});
			await this.recordAcquisition({
				retain: () => this.connected.push(database),
				step: "databases.close",
				target: database.driver,
				release: () => database.close(),
			});
		}
		if (this.currentState !== "starting") {
			return;
		}
		const migrations = this.deps.migrations;
		if (migrations !== undefined) {
			await runStep("migrations.run", () => migrations.run(), { logger: this.deps.logger });
		}
		if (this.currentState !== "starting") {
			return;
		}
		const ready = new Promise<void>((resolve) => {
			const onReady = (): void => {
				this.deps.client.off(Events.ClientReady, onReady);
				resolve();
			};
			this.deps.client.once(Events.ClientReady, onReady);
			this.cancelReady = onReady;
		});
		this.loginCalled = true;
		await runStep("gateway.login", () => this.deps.client.login(token), {
			logger: this.deps.logger,
		});
		await this.recordAcquisition({
			step: "gateway.destroy",
			release: () => this.deps.client.destroy(),
		});
		if (this.currentState !== "starting") {
			return;
		}
		await runStep("gateway.ready", () => ready, { logger: this.deps.logger });
		for (const module of this.deps.modules) {
			if (this.currentState !== "starting") {
				return;
			}
			try {
				if (module.setup !== undefined) {
					await runStep("module.setup", () => module.setup?.(), {
						logger: this.deps.logger,
						target: module.name,
					});
				}
				await this.recordAcquisition({
					retain: () => this.deps.statuses.markReady(module.name),
					step: "module.teardown",
					target: module.name,
					release: module.teardown === undefined ? undefined : () => module.teardown?.(),
				});
			} catch (error) {
				if (module.optional !== true) {
					throw error;
				}
				this.deps.statuses.markUnavailable(module.name);
			}
		}
		if (this.currentState !== "starting") {
			return;
		}
		const jobs: ScheduledJob[] = [];
		for (const module of this.deps.modules) {
			if (this.deps.statuses.isAvailable(module.name)) {
				jobs.push(...(module.jobs ?? []));
			}
		}
		await runStep("jobs.start", () => this.deps.scheduler.start(jobs), {
			logger: this.deps.logger,
		});
		await this.recordAcquisition({
			step: "jobs.stop",
			release: () => this.deps.scheduler.stop(),
		});
		if (this.currentState === "starting") {
			this.currentState = "running";
		}
	}

	// Once traversal starts, acquisitions bypass its snapshots and use the same cleanup budget.
	private async recordAcquisition(params: {
		retain?: () => unknown;
		step: string;
		target?: string;
		release?: (() => unknown) | undefined;
	}): Promise<void> {
		if (this.cleanupBudget === undefined) {
			params.retain?.();
		} else if (params.release !== undefined) {
			if (this.currentState === "stopped") {
				this.deps.logger.warn(
					{ step: params.step, target: params.target },
					"Releasing resource acquired after shutdown",
				);
			}
			await this.stopStep({
				step: params.step,
				target: params.target,
				action: params.release,
				budget: this.cleanupBudget,
			});
		}
	}

	private async stopSequence(params: {
		reason: StopReason;
		signal: string | undefined;
	}): Promise<StopReport> {
		const failed: { step: string; target?: string; error: string }[] = [];
		const abandoned: { step: string; target?: string }[] = [];
		const deadline =
			systemClock.now().getTime() + (this.deps.options?.shutdownTimeoutMs ?? SHUTDOWN_TIMEOUT_MS);
		const budget = { deadline, graceDeadline: deadline + SHUTDOWN_GRACE_MS, failed, abandoned };
		try {
			if (this.startup !== undefined) {
				await this.stopStep({
					step: "start.settle",
					action: () => this.startup?.then(startSettled, startSettled),
					budget,
				});
			}
			this.cleanupBudget = budget;
			if (this.deps.scheduler.started) {
				await this.stopStep({
					step: "jobs.stop",
					action: () => this.deps.scheduler.stop(),
					budget,
				});
			}
			for (const module of [...this.deps.modules].reverse()) {
				if (this.deps.statuses.isAvailable(module.name) && module.teardown !== undefined) {
					await this.stopStep({
						step: "module.teardown",
						target: module.name,
						action: () => module.teardown?.(),
						budget,
					});
				}
			}
			if (this.startup !== undefined && abandoned.some(({ step }) => step === "start.settle")) {
				// Startup includes acquisition cleanup, even when no cleanup was registered at timeout.
				// Its initial timeout is already in the report; this join shares the absolute grace bound.
				await runStep("start.settle", () => this.startup?.then(startSettled, startSettled), {
					logger: this.deps.logger,
					deadline: budget.graceDeadline,
				});
			}
			for (const database of [...this.connected].reverse()) {
				await this.stopStep({
					step: "databases.close",
					target: database.driver,
					action: () => database.close(),
					budget,
				});
			}
			if (this.loginCalled) {
				await this.stopStep({
					step: "gateway.destroy",
					action: () => this.deps.client.destroy(),
					budget,
				});
			}
			for (const flush of this.deps.options?.flushes ?? []) {
				await this.stopStep({
					step: "flush",
					target: flush.name,
					action: () => flush.flush(),
					budget,
				});
			}
			this.cancelReady?.();
			for (const unsubscribe of this.deps.subscriptions) {
				await this.stopStep({ step: "settings.unsubscribe", action: unsubscribe, budget });
			}
		} finally {
			this.currentState = "stopped";
			this.removeHandlers?.();
		}
		return {
			ok: failed.length === 0 && abandoned.length === 0,
			reason: params.reason,
			...(params.signal === undefined ? {} : { signal: params.signal }),
			failed,
			abandoned,
		};
	}

	private async stopStep(params: {
		step: string;
		target?: string;
		action: () => unknown;
		budget: ShutdownBudget;
	}): Promise<void> {
		const { step, target, budget } = params;
		const identity = { step, ...(target === undefined ? {} : { target }) };
		try {
			const result = await runStep(step, params.action, {
				logger: this.deps.logger,
				target,
				deadline: budget.deadline,
			});
			if (result.outcome === "abandoned") {
				budget.abandoned.push(identity);
				budget.deadline = budget.graceDeadline;
			}
		} catch (error) {
			budget.failed.push({ ...identity, error: errorMessage(error) });
			if (step === "flush") {
				process.stderr.write(`Lifecycle flush failed: ${errorMessage(error)}\n`);
			}
		}
	}
}

// The startup caller retains and rethrows the original error; shutdown only joins its settlement.
function startSettled(): void {}
