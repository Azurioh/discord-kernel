import type { ComponentHandler } from "@/discord/components/component-router";

/** Declare a {@link ComponentHandler}. Identity helper kept for a consistent DSL. */
export function createComponentHandler(handler: ComponentHandler): ComponentHandler {
	return handler;
}
