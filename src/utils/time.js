export function formatISO(date = new Date(), { compact = false } = {}) {
	const d = (date instanceof Date) ? date : new Date(date);
	const iso = d.toISOString(); // e.g. 2025-09-20T12:34:56.789Z
	if (!compact) return iso;
	// compact: 2025-09-20_12-34-56
	return iso.slice(0, 19).replace('T', '_').replaceAll(':', '-');
}
