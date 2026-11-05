import {
	type APIMessageTopLevelComponent,
	ContainerBuilder,
	FileBuilder,
	type JSONEncodable,
	MediaGalleryBuilder,
	MediaGalleryItemBuilder,
	SectionBuilder,
	SeparatorBuilder,
	SeparatorSpacingSize,
	TextDisplayBuilder,
	ThumbnailBuilder,
} from "discord.js";
import { type CompileContext, compileViewRow } from "@/discord/view/compile-view-row";
import type {
	ContainerChild,
	ContainerNode,
	FileNode,
	GalleryNode,
	MediaItem,
	SectionNode,
	SeparatorNode,
	V2Component,
} from "@/discord/view/view";

const SEPARATOR_SPACING = {
	small: SeparatorSpacingSize.Small,
	large: SeparatorSpacingSize.Large,
} as const;

function compileText(content: string): TextDisplayBuilder {
	return new TextDisplayBuilder().setContent(content);
}

function compileThumbnail(item: MediaItem): ThumbnailBuilder {
	const thumbnail = new ThumbnailBuilder().setURL(item.url);
	if (item.description !== undefined) {
		thumbnail.setDescription(item.description);
	}
	if (item.spoiler !== undefined) {
		thumbnail.setSpoiler(item.spoiler);
	}
	return thumbnail;
}

function compileGalleryItem(item: MediaItem): MediaGalleryItemBuilder {
	const galleryItem = new MediaGalleryItemBuilder().setURL(item.url);
	if (item.description !== undefined) {
		galleryItem.setDescription(item.description);
	}
	if (item.spoiler !== undefined) {
		galleryItem.setSpoiler(item.spoiler);
	}
	return galleryItem;
}

function compileSection<S>(node: SectionNode<S>, context: CompileContext<S>): SectionBuilder {
	const section = new SectionBuilder().addTextDisplayComponents(...node.texts.map(compileText));
	const { button, thumbnail } = node.accessory;
	if (button !== undefined) {
		return section.setButtonAccessory(button.apply(context.state, context.disabled));
	}
	return section.setThumbnailAccessory(compileThumbnail(thumbnail));
}

function compileSeparator(node: SeparatorNode): SeparatorBuilder {
	const separator = new SeparatorBuilder();
	if (node.spacing !== undefined) {
		separator.setSpacing(SEPARATOR_SPACING[node.spacing]);
	}
	if (node.divider !== undefined) {
		separator.setDivider(node.divider);
	}
	return separator;
}

function compileGallery(node: GalleryNode): MediaGalleryBuilder {
	return new MediaGalleryBuilder().addItems(...node.items.map(compileGalleryItem));
}

function compileFile(node: FileNode): FileBuilder {
	const file = new FileBuilder().setURL(`attachment://${node.name}`);
	if (node.spoiler !== undefined) {
		file.setSpoiler(node.spoiler);
	}
	return file;
}

/** Add one child to a container, through the `add*Components` method of its kind. */
function addChild<S>(
	container: ContainerBuilder,
	child: ContainerChild<S>,
	context: CompileContext<S>,
): void {
	switch (child.type) {
		case "text":
			container.addTextDisplayComponents(compileText(child.content));
			return;
		case "section":
			container.addSectionComponents(compileSection(child, context));
			return;
		case "separator":
			container.addSeparatorComponents(compileSeparator(child));
			return;
		case "gallery":
			container.addMediaGalleryComponents(compileGallery(child));
			return;
		case "file":
			container.addFileComponents(compileFile(child));
			return;
		case "buttons":
		case "select":
			container.addActionRowComponents(compileViewRow(child, context));
			return;
		default:
			child satisfies never;
	}
}

function compileContainer<S>(node: ContainerNode<S>, context: CompileContext<S>): ContainerBuilder {
	const container = new ContainerBuilder();
	if (node.accent !== undefined) {
		container.setAccentColor(node.accent);
	}
	if (node.spoiler !== undefined) {
		container.setSpoiler(node.spoiler);
	}
	for (const child of node.children) {
		if (child !== null) {
			addChild(container, child, context);
		}
	}
	return container;
}

/**
 * Compile one top-level V2 node to its discord.js builder. Sets no message flag:
 * that is `renderView`'s job.
 *
 * @param node - A node already checked by `validateView`.
 * @param context - The state buttons render against, and whether every control is disabled.
 * @returns The builder discord.js sends as a top-level component.
 */
export function compileV2Component<S>(
	node: V2Component<S>,
	context: CompileContext<S>,
): JSONEncodable<APIMessageTopLevelComponent> {
	switch (node.type) {
		case "container":
			return compileContainer(node, context);
		case "text":
			return compileText(node.content);
		case "section":
			return compileSection(node, context);
		case "separator":
			return compileSeparator(node);
		case "gallery":
			return compileGallery(node);
		case "file":
			return compileFile(node);
		case "buttons":
		case "select":
			return compileViewRow(node, context);
		default:
			return node satisfies never;
	}
}
