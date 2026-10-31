/** Transport for deploying application commands, without requiring a Discord connection.
 * @port
 */
export interface CommandDeployRest {
	/** Replace the commands at a Discord REST route. */
	put(route: string, options: { body: unknown }): Promise<unknown>;
}
