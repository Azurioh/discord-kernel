import {
	type Attachment,
	ChannelType,
	Collection,
	ComponentType,
	type ModalSubmitInteraction,
} from "discord.js";
import { describe, expect, it } from "vitest";
import { createModal } from "@/discord/interaction/modal";

/** Stands in for one file the administrator picked; `read` only passes it along. */
const AN_IMAGE = { name: "banner.png" } as unknown as Attachment;

interface FakeSubmission {
	/** Text values, keyed by field name. */
	readonly text?: Record<string, string>;
	/**
	 * Uploads, keyed by field name. A key present with an empty list is a file
	 * field that was shown and left alone — the other half of "nothing entered".
	 */
	readonly uploads?: Record<string, readonly Attachment[]>;
	/** String select choices, keyed by field name. */
	readonly selects?: Record<string, readonly string[]>;
	/** Role/user/channel picks, keyed by field name, as the chosen identifiers. */
	readonly ids?: Record<string, readonly string[]>;
}

/** Only the accessors `read` touches, so no gateway client is needed. */
function fakeSubmit(submission: FakeSubmission): ModalSubmitInteraction {
	const text = submission.text ?? {};
	const uploads = submission.uploads ?? {};
	const selects = submission.selects ?? {};
	const ids = submission.ids ?? {};
	const collectionFor = (name: string) => {
		const picked = ids[name] ?? [];
		return picked.length === 0 ? null : new Collection(picked.map((id) => [id, { id }]));
	};
	return {
		fields: {
			fields: new Map(
				[
					...Object.keys(text),
					...Object.keys(uploads),
					...Object.keys(selects),
					...Object.keys(ids),
				].map((name) => [name, {}]),
			),
			getTextInputValue: (name: string) => text[name] ?? "",
			getUploadedFiles: (name: string) => {
				const files = uploads[name] ?? [];
				return files.length === 0
					? null
					: new Collection(files.map((file, index) => [`file-${index}`, file]));
			},
			getStringSelectValues: (name: string) => selects[name] ?? [],
			getSelectedRoles: (name: string) => collectionFor(name),
			getSelectedUsers: (name: string) => collectionFor(name),
			getSelectedChannels: (name: string) => collectionFor(name),
		},
	} as unknown as ModalSubmitInteraction;
}

const reportModal = createModal({
	id: "report",
	title: "Report a message",
	fields: {
		reason: { label: "Reason" },
		details: { label: "Details", style: "paragraph", required: false },
	},
});

const evidenceModal = createModal({
	id: "evidence",
	title: "Attach evidence",
	fields: {
		proof: { kind: "file", label: "Proof", description: "PNG or JPEG", maxValues: 1 },
		extras: { kind: "file", label: "Anything else", required: false, maxValues: 2 },
	},
});

/** The upload component a label wraps, as the built modal declares it. */
function fileComponent(
	modal: ReturnType<typeof evidenceModal.build>,
	index: number,
): { type: number; custom_id: string; required?: boolean; max_values?: number } {
	const json = modal.toJSON() as {
		components: { component: { type: number; custom_id: string } }[];
	};
	return json.components[index]?.component as {
		type: number;
		custom_id: string;
		required?: boolean;
		max_values?: number;
	};
}

describe("createModal", () => {
	it("builds a modal carrying its id and title", () => {
		const json = reportModal.build().toJSON() as { custom_id: string; title: string };

		expect(json.custom_id).toBe("report");
		expect(json.title).toBe("Report a message");
	});

	// State rides in the customId after a colon, which is exactly what the
	// ComponentRouter matches on — that is what survives a restart.
	it("appends state so the router still claims it", () => {
		const json = reportModal.build("message-42").toJSON() as { custom_id: string };

		expect(json.custom_id).toBe("report:message-42");
	});

	it("reads submitted values keyed like the declaration", () => {
		const values = reportModal.read(
			fakeSubmit({ text: { reason: "Spam", details: "Repeated links" } }),
		);

		expect(values).toEqual({ reason: "Spam", details: "Repeated links" });
	});

	// A blank optional field arrives either empty or absent; both mean "nothing
	// entered", so callers must not have to branch twice.
	it("collapses an empty optional field to null", () => {
		expect(
			reportModal.read(fakeSubmit({ text: { reason: "Spam", details: "" } })).details,
		).toBeNull();
	});

	it("collapses an omitted optional field to null", () => {
		expect(reportModal.read(fakeSubmit({ text: { reason: "Spam" } })).details).toBeNull();
	});
});

describe("createModal legend", () => {
	it("carries no text display when none is declared", () => {
		const json = reportModal.build().toJSON() as { components: { type: number }[] };

		expect(json.components.every((component) => component.type !== 10)).toBe(true);
	});

	it("puts the legend first, as a text display, ahead of the declared fields", () => {
		const modal = createModal({
			id: "legend-carrying",
			title: "Legend carrying",
			legend: "Use {tokens} freely.",
			fields: { reason: { label: "Reason" } },
		});

		const json = modal.build().toJSON() as {
			components: { type: number; content?: string; label?: string }[];
		};

		expect(json.components[0]).toMatchObject({ type: 10, content: "Use {tokens} freely." });
		expect(json.components[1]?.label).toBe("Reason");
	});
});

describe("createModal file fields", () => {
	it("builds a file upload component under its label", () => {
		const component = fileComponent(evidenceModal.build(), 0);

		expect(component.type).toBe(ComponentType.FileUpload);
		expect(component.custom_id).toBe("proof");
	});

	it("carries the field's own constraints", () => {
		const built = evidenceModal.build();

		expect(fileComponent(built, 0)).toMatchObject({ required: true, max_values: 1 });
		expect(fileComponent(built, 1)).toMatchObject({ required: false, max_values: 2 });
	});

	it("reads what was uploaded, keyed like the declaration", () => {
		const values = evidenceModal.read(
			fakeSubmit({ uploads: { proof: [AN_IMAGE], extras: [AN_IMAGE] } }),
		);

		expect(values.proof).toEqual([AN_IMAGE]);
		expect(values.extras).toEqual([AN_IMAGE]);
	});

	// The same "nothing entered" collapsing an optional text field already has:
	// the field comes back present but empty, or not at all.
	it("collapses an optional file field nothing was uploaded to to null", () => {
		expect(
			evidenceModal.read(fakeSubmit({ uploads: { proof: [AN_IMAGE], extras: [] } })).extras,
		).toBeNull();
	});

	it("collapses an omitted optional file field to null", () => {
		expect(evidenceModal.read(fakeSubmit({ uploads: { proof: [AN_IMAGE] } })).extras).toBeNull();
	});

	/** A text input and an upload side by side, which is what an image field needs. */
	it("reads a file and a text field from the same submission", () => {
		const imageModal = createModal({
			id: "panel-image",
			title: "Image",
			fields: {
				upload: { kind: "file", label: "Upload", required: false },
				address: { kind: "text", label: "…or an address", required: false },
			},
		});

		const values = imageModal.read(
			fakeSubmit({ text: { address: "https://example.test/a.png" }, uploads: { upload: [] } }),
		);

		expect(values.upload).toBeNull();
		expect(values.address).toBe("https://example.test/a.png");
	});
});

/** The component a label wraps, as the built modal declares it, for any field kind. */
function labelComponent(
	modal: ReturnType<typeof reportModal.build>,
	index: number,
): {
	type: number;
	custom_id: string;
	required?: boolean;
	min_values?: number;
	max_values?: number;
	options?: { label: string; value: string; description?: string; default?: boolean }[];
	default_values?: { type: string; id: string }[];
	channel_types?: number[];
} {
	const json = modal.toJSON() as {
		components: {
			component: {
				type: number;
				custom_id: string;
				required?: boolean;
				min_values?: number;
				max_values?: number;
				options?: { label: string; value: string; description?: string; default?: boolean }[];
				default_values?: { type: string; id: string }[];
				channel_types?: number[];
			};
		}[];
	};
	return json.components[index]?.component as ReturnType<typeof labelComponent>;
}

describe("createModal select fields", () => {
	const pollModal = createModal({
		id: "poll",
		title: "Cast a vote",
		fields: {
			choice: {
				kind: "select",
				label: "Pick one",
				options: [
					{ label: "Cats", value: "cats", description: "Purr" },
					{ label: "Dogs", value: "dogs", default: true },
				],
				placeholder: "Choose your favourite",
				minValues: 1,
				maxValues: 1,
			},
		},
	});

	it("builds a string select's options", () => {
		const component = labelComponent(pollModal.build(), 0);

		expect(component.type).toBe(ComponentType.StringSelect);
		expect(component.custom_id).toBe("choice");
		expect(component.options).toEqual([
			{ label: "Cats", value: "cats", description: "Purr", default: false },
			{ label: "Dogs", value: "dogs", default: true },
		]);
		expect(component).toMatchObject({
			placeholder: "Choose your favourite",
			min_values: 1,
			max_values: 1,
		});
	});

	it("reads the chosen select values back, keyed like the declaration", () => {
		const values = pollModal.read(fakeSubmit({ selects: { choice: ["dogs"] } }));

		expect(values.choice).toEqual(["dogs"]);
	});
});

describe("createModal role/user/channel fields", () => {
	const assignmentModal = createModal({
		id: "assignment",
		title: "Assign",
		fields: {
			owner: { kind: "role", label: "Owning role", defaultRoleIds: ["role-1"] },
			reviewer: { kind: "user", label: "Reviewer", required: false, defaultUserIds: ["user-1"] },
			destination: {
				kind: "channel",
				label: "Destination",
				channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
				defaultChannelIds: ["channel-1"],
			},
		},
	});

	it("applies default values to the role/user/channel builders", () => {
		const built = assignmentModal.build();

		expect(labelComponent(built, 0).default_values).toEqual([{ type: "role", id: "role-1" }]);
		expect(labelComponent(built, 1).default_values).toEqual([{ type: "user", id: "user-1" }]);
		expect(labelComponent(built, 2).default_values).toEqual([{ type: "channel", id: "channel-1" }]);
	});

	it("poses the channel select's channelTypes", () => {
		const component = labelComponent(assignmentModal.build(), 2);

		expect(component.type).toBe(ComponentType.ChannelSelect);
		expect(component.channel_types).toEqual([ChannelType.GuildText, ChannelType.GuildAnnouncement]);
	});

	it("reads a required role field's selected identifiers", () => {
		const values = assignmentModal.read(
			fakeSubmit({ ids: { owner: ["role-42"], destination: ["channel-9"] } }),
		);

		expect(values.owner).toEqual(["role-42"]);
	});

	it("collapses an optional user field with an empty selection to null", () => {
		const values = assignmentModal.read(
			fakeSubmit({ ids: { owner: ["role-42"], reviewer: [], destination: ["channel-9"] } }),
		);

		expect(values.reviewer).toBeNull();
	});

	it("collapses an omitted optional user field to null", () => {
		const values = assignmentModal.read(
			fakeSubmit({ ids: { owner: ["role-42"], destination: ["channel-9"] } }),
		);

		expect(values.reviewer).toBeNull();
	});
});
