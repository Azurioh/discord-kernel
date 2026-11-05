/**
 * Discord refuses a Components V2 message carrying more components than this,
 * nested ones (a container's children, a section's texts and accessory, a row's
 * buttons) counted. Source: discord.js guide, "Display components".
 */
export const MAX_V2_COMPONENTS = 40;

/**
 * Discord's cap on the characters carried by every text display of a
 * Components V2 message, summed. Source: discord.js guide, "Display components".
 */
export const MAX_V2_TEXT_CHARACTERS = 4000;

/**
 * A section holds one to this many text displays. Source: `discord-api-types`
 * `APISectionComponent.components` (`payloads/v10/message.d.ts`). Enforced by the
 * `SectionNode.texts` tuple type.
 */
export const MAX_SECTION_TEXTS = 3;

/**
 * A media gallery holds one to this many items. Source: `discord-api-types`
 * `APIMediaGalleryComponent.items` (`payloads/v10/message.d.ts`).
 */
export const MAX_GALLERY_ITEMS = 10;

/**
 * Longest description a gallery item or a thumbnail accepts. Source:
 * `discord-api-types` `APIMediaGalleryItem.description` and the
 * `@discordjs/builders` media validators.
 */
export const MAX_MEDIA_DESCRIPTION = 1024;

/**
 * An action row holds at most this many buttons. Source: `discord-api-types`
 * `APIActionRowComponent` (`payloads/v10/message.d.ts`).
 */
export const MAX_ROW_BUTTONS = 5;

/**
 * A message without the Components V2 flag holds at most this many action
 * rows. Source: Discord message resource, "Message Components".
 */
export const MAX_MESSAGE_ROWS = 5;

/**
 * A message holds at most this many embeds. Source: Discord message resource,
 * "Create Message" (`embeds`).
 */
export const MAX_MESSAGE_EMBEDS = 10;
