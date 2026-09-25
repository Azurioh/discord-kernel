/**
 * The single mutable cell shared by the view and the collector. Kept explicit
 * rather than captured as a closure variable so the two always read the same
 * reference.
 */
export interface StateStore<S> {
	read(): S;
	write(next: S): void;
}

/** Hold a state the collector can advance in place. */
export function createStateStore<S>(initial: S): StateStore<S> {
	let state = initial;
	return {
		read: () => state,
		write: (next) => {
			state = next;
		},
	};
}
