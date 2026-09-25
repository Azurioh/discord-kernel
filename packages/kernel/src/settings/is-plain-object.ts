/**
 * Whether `value` is a plain object keyed by string, as JSON gives back: not
 * `null`, an array, a class instance or a promise.
 */
export function isPlainObject(value: unknown): value is Readonly<Record<string, unknown>> {
	if (typeof value !== "object" || value === null) {
		return false;
	}
	const prototype: unknown = Object.getPrototypeOf(value);
	return prototype === Object.prototype || prototype === null;
}
