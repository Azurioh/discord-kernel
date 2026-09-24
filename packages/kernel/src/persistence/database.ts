/**
 * Driver-agnostic persistence port. It exists so the framework (boot, graceful
 * shutdown) can own a database lifecycle without ever naming a vendor: adding a
 * SQL or Redis driver must not require touching this file, only adding an
 * adapter that satisfies this contract.
 *
 * Deliberately narrow: querying is not part of it. Query APIs differ too much
 * between engines to be usefully abstracted here, so each adapter exposes its
 * own (Mongo collections, SQL statements…) and repositories in the module
 * `infrastructure/` layer are the only code allowed to use it.
 */
export interface DatabaseConnection {
	/**
	 * Discriminant identifying the concrete driver. Adapters narrow it to a
	 * string literal so consumers can select an implementation by comparison
	 * rather than by `instanceof`, which would force a vendor import.
	 */
	readonly driver: string;
	/** Open the connection. Idempotent: safe to call from several call sites. */
	connect(): Promise<void>;
	/** Release the connection on graceful shutdown. */
	close(): Promise<void>;
}
