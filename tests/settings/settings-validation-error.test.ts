import { describe, expect, it } from "vitest";
import { ValidationError, WarningError } from "@/errors";
import { type SettingsIssue, SettingsValidationError } from "@/settings/settings-validation-error";

const requiredIssue: SettingsIssue = {
	field: "logChannel",
	code: "required",
	translation: { key: "core.settings.issue.required" },
};

const maxIssue: SettingsIssue = {
	field: "allowedRoles[2]",
	code: "maxItems",
	translation: { key: "core.settings.issue.max-items", params: { max: 5 } },
};

describe("SettingsValidationError", () => {
	it("is a ValidationError, hence a benign warning", () => {
		const error = new SettingsValidationError([requiredIssue]);

		expect(error).toBeInstanceOf(ValidationError);
		expect(error).toBeInstanceOf(WarningError);
		expect(error.severity).toBe("warning");
	});

	it("carries every issue in submission order", () => {
		const error = new SettingsValidationError([requiredIssue, maxIssue]);

		expect(error.issues).toEqual([requiredIssue, maxIssue]);
	});

	it("names each failing field and code in its English message", () => {
		const error = new SettingsValidationError([requiredIssue, maxIssue]);

		expect(error.message).toBe(
			"Invalid settings: logChannel (required), allowedRoles[2] (maxItems)",
		);
	});
});
