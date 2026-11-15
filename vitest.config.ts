import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
	test: {
		environment: "node",
		include: ["test/**/*.test.ts"]
	},
	resolve: {
		alias: {
			obsidian: path.resolve(__dirname, "test/mocks/obsidian.ts")
		}
	}
});
