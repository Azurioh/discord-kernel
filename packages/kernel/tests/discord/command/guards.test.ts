import type { CommandInteraction } from "discord.js";
import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { describe, expect, it } from "vitest";
import { fixedClock } from "@/clock";
import { createCooldownGuard } from "@/discord/command/cooldown-guard";
import { allOf, anyOf } from "@/discord/command/guard";
import {
	createPermissionGuard,
	createRoleGuard,
	guildOnlyGuard,
} from "@/discord/command/permission-guard";

interface FakeInteractionOptions {
	permissions?: PermissionsBitField | null;
	roleIds?: string[];
	inGuild?: boolean;
	userId?: string;
	guildId?: string;
	commandName?: string;
}

/**
 * A structural stand-in for a command interaction. The guards only read a
 * handful of fields, so faking them keeps the tests free of a real gateway
 * client while exercising the exact branches that matter.
 */
function fakeInteraction(options: FakeInteractionOptions = {}): CommandInteraction {
	const inGuild = options.inGuild ?? true;
	const roleIds = options.roleIds ?? [];
	return {
		commandName: options.commandName ?? "test",
		user: { id: options.userId ?? "user-1" },
		guildId: inGuild ? (options.guildId ?? "guild-1") : null,
		memberPermissions: options.permissions === undefined ? null : options.permissions,
		member: inGuild ? { roles: { cache: new Map(roleIds.map((id) => [id, {}])) } } : null,
		inGuild: () => inGuild,
		inCachedGuild: () => inGuild,
	} as unknown as CommandInteraction;
}

describe("createPermissionGuard", () => {
	it("allows a member holding every required permission", async () => {
		const guard = createPermissionGuard([PermissionFlagsBits.ManageChannels]);
		const interaction = fakeInteraction({
			permissions: new PermissionsBitField([PermissionFlagsBits.ManageChannels]),
		});

		expect(guard.check(interaction)).toEqual({ ok: true });
	});

	it("denies and names the missing permission", async () => {
		const guard = createPermissionGuard([
			PermissionFlagsBits.ManageChannels,
			PermissionFlagsBits.MoveMembers,
		]);
		const interaction = fakeInteraction({
			permissions: new PermissionsBitField([PermissionFlagsBits.ManageChannels]),
		});

		const result = await guard.check(interaction);

		expect(result.ok).toBe(false);
		expect(result.ok === false && result.message).toEqual({
			key: "core.guard.permission-denied",
			params: { missing: expect.stringContaining("MoveMembers") },
		});
	});

	// Outside a guild `memberPermissions` is null; that must deny, never pass.
	it("denies when permissions cannot be resolved", async () => {
		const guard = createPermissionGuard([PermissionFlagsBits.ManageChannels]);

		const result = await guard.check(fakeInteraction({ permissions: null }));

		expect(result.ok).toBe(false);
	});

	it("uses the overridden denial message", async () => {
		const guard = createPermissionGuard([PermissionFlagsBits.ManageChannels], "Nope.");

		const result = await guard.check(fakeInteraction({ permissions: null }));

		expect(result).toEqual({ ok: false, message: "Nope." });
	});
});

describe("createRoleGuard", () => {
	it("allows a member holding one of the roles", async () => {
		const guard = createRoleGuard(["role-a", "role-b"]);

		const result = await guard.check(fakeInteraction({ roleIds: ["role-b"] }));

		expect(result).toEqual({ ok: true });
	});

	it("denies a member holding none of them", async () => {
		const guard = createRoleGuard(["role-a"]);

		const result = await guard.check(fakeInteraction({ roleIds: ["role-z"] }));

		expect(result.ok).toBe(false);
	});

	it("denies outside a guild, where there is no member", async () => {
		const guard = createRoleGuard(["role-a"]);

		const result = await guard.check(fakeInteraction({ inGuild: false }));

		expect(result.ok).toBe(false);
	});
});

describe("guildOnlyGuard", () => {
	it("allows inside a guild", async () => {
		expect(guildOnlyGuard.check(fakeInteraction())).toEqual({ ok: true });
	});

	it("denies outside a guild", async () => {
		const result = await guildOnlyGuard.check(fakeInteraction({ inGuild: false }));

		expect(result.ok).toBe(false);
	});
});

describe("createCooldownGuard", () => {
	it("allows the first call and rejects the next one inside the window", async () => {
		const guard = createCooldownGuard({ windowMs: 5000, clock: fixedClock(new Date(0)) });
		const interaction = fakeInteraction();

		expect(guard.check(interaction)).toEqual({ ok: true });
		const second = await guard.check(interaction);

		expect(second.ok).toBe(false);
		expect(second.ok === false && second.message).toEqual({
			key: "core.cooldown.wait",
			params: { seconds: 5 },
		});
	});

	it("allows again once the window has elapsed", async () => {
		let now = new Date(0);
		const guard = createCooldownGuard({ windowMs: 5000, clock: { now: () => now } });
		const interaction = fakeInteraction();

		await guard.check(interaction);
		now = new Date(5000);

		expect(guard.check(interaction)).toEqual({ ok: true });
	});

	it("keeps windows separate per user by default", async () => {
		const guard = createCooldownGuard({ windowMs: 5000, clock: fixedClock(new Date(0)) });

		await guard.check(fakeInteraction({ userId: "user-1" }));
		const other = await guard.check(fakeInteraction({ userId: "user-2" }));

		expect(other).toEqual({ ok: true });
	});

	it("shares one window across a guild when scoped to it", async () => {
		const guard = createCooldownGuard({
			windowMs: 5000,
			scope: "guild",
			clock: fixedClock(new Date(0)),
		});

		await guard.check(fakeInteraction({ userId: "user-1" }));
		const other = await guard.check(fakeInteraction({ userId: "user-2" }));

		expect(other.ok).toBe(false);
	});
});

describe("composition", () => {
	it("keeps the new guards usable with allOf/anyOf", async () => {
		const interaction = fakeInteraction({ roleIds: ["role-a"] });
		const composed = allOf(guildOnlyGuard, createRoleGuard(["role-a"]));

		await expect(composed.check(interaction)).resolves.toEqual({ ok: true });
		await expect(
			anyOf("Denied.", createRoleGuard(["role-z"]), createRoleGuard(["role-a"])).check(interaction),
		).resolves.toEqual({ ok: true });
	});
});
