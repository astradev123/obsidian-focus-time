import { describe, expect, it } from "vitest";
import { PluginDataManager } from "../src/core/pluginDataManager";
import { SettingsStore } from "../src/core/settings";

function createStore(initial: Record<string, unknown> = {}) {
	const data: Record<string, unknown> = {settings: initial};
	const manager = {
		get: (category: string) => data[category],
		put: async (category: string, key: string, value: unknown) => {
			const bucket = (data[category] ?? {}) as Record<string, unknown>;
			bucket[key] = value;
			data[category] = bucket;
		}
	} as unknown as PluginDataManager;
	return new SettingsStore(manager);
}

describe("SettingsStore", () => {
	it("enables concept hints by default", async () => {
		const store = createStore();
		await store.load();
		expect(store.get().showHelpIcons).toBe(true);
	});

	it("persists the concept hint toggle", async () => {
		const store = createStore({showHelpIcons: false});
		await store.load();
		expect(store.get().showHelpIcons).toBe(false);

		await store.update({showHelpIcons: true});
		expect(store.get().showHelpIcons).toBe(true);
	});
});
