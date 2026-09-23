import { describeError } from "@/errors/describe-error";
import type { Logger } from "@/logger";
import type {
	SettingsChangedEvent,
	SettingsChangedNotifier,
} from "@/settings/ports/settings-changed-notifier";

type Listener = (event: SettingsChangedEvent) => void;

/**
 * {@link SettingsChangedNotifier} that delivers events synchronously to
 * listeners in the same process. A throwing listener never stops the others
 * nor reaches the writer that notified: its error is always logged.
 */
export function createInProcessNotifier(logger: Logger): SettingsChangedNotifier {
	const listeners = new Set<Listener>();

	return {
		notify(event) {
			// Snapshot, so a listener that unsubscribes during delivery cannot skip another.
			for (const listener of [...listeners]) {
				try {
					listener(event);
				} catch (error) {
					logger.error(
						{ guildId: event.guildId, moduleId: event.moduleId, err: describeError(error) },
						"Settings change listener failed",
					);
				}
			}
		},

		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
