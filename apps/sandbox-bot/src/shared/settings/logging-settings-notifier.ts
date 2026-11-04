import type { Logger } from "@azurioh/discord-kernel/logger";
import {
	createInProcessNotifier,
	type SettingsChangedNotifier,
} from "@azurioh/discord-kernel/settings";

/** Log every settings change while retaining in-process cache invalidation.
 * @param logger - The application logger.
 * @returns The settings notification adapter.
 */
export function createLoggingSettingsNotifier(logger: Logger): SettingsChangedNotifier {
	const notifier = createInProcessNotifier(logger);
	notifier.subscribe((event) => {
		logger.info({ ...event }, "Settings changed");
	});
	return notifier;
}
