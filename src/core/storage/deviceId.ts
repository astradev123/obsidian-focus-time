function randomId(length: number): string {
	const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
	let result = "";
	for (let i = 0; i < length; i++) {
		result += alphabet[Math.floor(Math.random() * alphabet.length)];
	}
	return result;
}

/**
 * Device id is stored locally and never synced, so two devices can never
 * write the same event shard.
 */
export function resolveDeviceId(vaultName: string): string {
	const key = `focus-time:device-id:${vaultName}`;
	try {
		const existing = window.localStorage.getItem(key);
		if (existing && /^[a-z0-9]{4,12}$/.test(existing)) {
			return existing;
		}
		const id = randomId(6);
		window.localStorage.setItem(key, id);
		return id;
	} catch {
		return randomId(6);
	}
}
