import { PermissionFlagsBits, PermissionsBitField } from "discord.js";
import { describe, expect, it } from "vitest";
import { formatPermissions, missingPermissions, resolvePermissions } from "@/discord/permissions";

describe("resolvePermissions", () => {
	it("combines flags into a single bitfield", () => {
		const combined = resolvePermissions([
			PermissionFlagsBits.ManageChannels,
			PermissionFlagsBits.ManageRoles,
		]);

		expect(combined).toBe(PermissionFlagsBits.ManageChannels | PermissionFlagsBits.ManageRoles);
	});

	it("resolves an empty list to no permission", () => {
		expect(resolvePermissions([])).toBe(0n);
	});
});

describe("missingPermissions", () => {
	it("returns nothing when every required bit is held", () => {
		const held = new PermissionsBitField([
			PermissionFlagsBits.ManageChannels,
			PermissionFlagsBits.MoveMembers,
		]);

		expect(missingPermissions(held, [PermissionFlagsBits.ManageChannels])).toEqual([]);
	});

	it("returns only the bits that are absent", () => {
		const held = new PermissionsBitField([PermissionFlagsBits.ManageChannels]);

		expect(
			missingPermissions(held, [
				PermissionFlagsBits.ManageChannels,
				PermissionFlagsBits.MoveMembers,
			]),
		).toEqual([PermissionFlagsBits.MoveMembers]);
	});

	// Unresolved permissions must never read as granted: outside a guild the
	// answer is unknown, and unknown is not success.
	it("treats unresolved permissions as everything missing", () => {
		const required = [PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers];

		expect(missingPermissions(null, required)).toEqual(required);
	});
});

describe("formatPermissions", () => {
	it("names the bits for a user-facing message", () => {
		expect(
			formatPermissions([PermissionFlagsBits.ManageChannels, PermissionFlagsBits.MoveMembers]),
		).toBe("ManageChannels, MoveMembers");
	});
});
