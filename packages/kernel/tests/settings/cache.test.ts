import { describe, expect, it } from "vitest";
import type { Clock } from "@/clock";
import { createSettingsCache, SETTINGS_CACHE_TTL_MS } from "@/settings/cache";
import { createInProcessNotifier } from "@/settings/in-memory/in-process-notifier";
import type { StoredSettings } from "@/settings/ports/settings-store";
import { createFakeLogger } from "../support/fake-logger";
import { createReadOnlySettingsService } from "./fixtures/read-only-settings-service";
import { sampleSettings } from "./fixtures/sample-declaration";

const GUILD = "100000000000000001";
const OTHER_GUILD = "100000000000000002";
const MODULE = "tickets";

/** A clock the test moves forward by hand. */
function manualClock(): Clock & { advance(ms: number): void } {
	let now = Date.parse("2026-01-01T00:00:00.000Z");
	return {
		now: () => new Date(now),
		advance(ms) {
			now += ms;
		},
	};
}

function makeCache() {
	const clock = manualClock();
	const notifier = createInProcessNotifier(createFakeLogger());
	const cache = createSettingsCache({ clock, notifier });
	return { clock, notifier, cache };
}

function changed(guildId: string, moduleId: string) {
	return { guildId, moduleId, changedKeys: ["a"], revision: 2 };
}

describe("createSettingsCache", () => {
	it("keeps sixty seconds by default", () => {
		expect(SETTINGS_CACHE_TTL_MS).toBe(60_000);
	});

	it("loads once, then serves the cached values", async () => {
		const { cache } = makeCache();
		let loads = 0;
		const load = async () => ({ value: ++loads });

		expect(await cache.read(GUILD, MODULE, load)).toEqual({ value: 1 });
		expect(await cache.read(GUILD, MODULE, load)).toEqual({ value: 1 });
		expect(loads).toBe(1);
	});

	it("keys entries by guild and module", async () => {
		const { cache } = makeCache();
		let loads = 0;
		const load = async () => ++loads;

		await cache.read(GUILD, MODULE, load);
		await cache.read(OTHER_GUILD, MODULE, load);
		await cache.read(GUILD, "levels", load);

		expect(loads).toBe(3);
	});

	it("reloads once the time to live has passed, not before", async () => {
		const { cache, clock } = makeCache();
		let loads = 0;
		const load = async () => ++loads;

		await cache.read(GUILD, MODULE, load);
		clock.advance(SETTINGS_CACHE_TTL_MS - 1);
		expect(await cache.read(GUILD, MODULE, load)).toBe(1);
		clock.advance(1);
		expect(await cache.read(GUILD, MODULE, load)).toBe(2);
	});

	it("drops an entry on invalidate", async () => {
		const { cache } = makeCache();
		let loads = 0;
		const load = async () => ++loads;

		await cache.read(GUILD, MODULE, load);
		cache.invalidate(GUILD, MODULE);

		expect(await cache.read(GUILD, MODULE, load)).toBe(2);
	});

	it("drops the entry a notifier event names, and only that one", async () => {
		const { cache, notifier } = makeCache();
		let loads = 0;
		const load = async () => ++loads;

		await cache.read(GUILD, MODULE, load);
		await cache.read(OTHER_GUILD, MODULE, load);
		notifier.notify(changed(GUILD, MODULE));

		expect(await cache.read(GUILD, MODULE, load)).toBe(3);
		expect(await cache.read(OTHER_GUILD, MODULE, load)).toBe(2);
	});

	it("does not keep a value loaded before an invalidation that happened during the load", async () => {
		const { cache } = makeCache();
		let loads = 0;
		let release: () => void = () => undefined;
		const slow = () =>
			new Promise<number>((resolve) => {
				loads += 1;
				const value = loads;
				release = () => resolve(value);
			});

		const pending = cache.read(GUILD, MODULE, slow);
		cache.invalidate(GUILD, MODULE);
		release();

		expect(await pending).toBe(1);
		expect(await cache.read(GUILD, MODULE, async () => ++loads)).toBe(2);
	});

	it("does not cache a failed load", async () => {
		const { cache } = makeCache();

		await expect(
			cache.read(GUILD, MODULE, () => Promise.reject(new Error("store down"))),
		).rejects.toThrow("store down");
		expect(await cache.read(GUILD, MODULE, async () => "fresh")).toBe("fresh");
	});
});

describe("SettingsService.get through the cache (S19)", () => {
	const CTX = { guildId: GUILD, userId: "400000000000000001", locale: "en" };

	function record(values: Record<string, unknown>, revision = 1): StoredSettings {
		return {
			guildId: GUILD,
			moduleId: sampleSettings.id,
			version: sampleSettings.version,
			revision,
			values,
			updatedAt: "2026-01-01T00:00:00.000Z",
		};
	}

	it("reads the store once for repeated reads of one guild and module", async () => {
		const { service, read } = await createReadOnlySettingsService([record({ maxOpen: 3 })]);

		await service.get(sampleSettings, GUILD);
		await service.getForSurface(sampleSettings, GUILD);
		const values = await service.get(sampleSettings, GUILD);

		expect(values.maxOpen).toBe(3);
		expect(read).toHaveBeenCalledTimes(1);
	});

	it("reads the fresh value right after its own write", async () => {
		const { service } = await createReadOnlySettingsService([record({ maxOpen: 3 })]);
		await service.get(sampleSettings, GUILD);

		await service.set(sampleSettings, GUILD, { maxOpen: 4 }, CTX);

		expect((await service.get(sampleSettings, GUILD)).maxOpen).toBe(4);
	});

	it("reads the fresh value right after its own reset", async () => {
		const { service } = await createReadOnlySettingsService([record({ maxOpen: 3 })]);
		await service.get(sampleSettings, GUILD);

		await service.reset(sampleSettings, GUILD, ["maxOpen"], CTX);

		expect((await service.get(sampleSettings, GUILD)).maxOpen).toBe(1);
	});

	it("reads the fresh value after a change another process notified", async () => {
		const { service, store, notifier } = await createReadOnlySettingsService([
			record({ maxOpen: 3 }),
		]);
		await service.get(sampleSettings, GUILD);

		await store.write(record({ maxOpen: 5 }, 2), { expectedRevision: 1 });
		const stale = await service.get(sampleSettings, GUILD);
		notifier.notify({
			guildId: GUILD,
			moduleId: sampleSettings.id,
			changedKeys: ["maxOpen"],
			revision: 2,
		});

		expect(stale.maxOpen).toBe(3);
		expect((await service.get(sampleSettings, GUILD)).maxOpen).toBe(5);
	});
});
