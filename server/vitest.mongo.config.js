import { defineConfig } from "vitest/config";
export default defineConfig({ test: { env: { DB_CLIENT: "mongodb" }, environment: "node", include: ["test/mongo/**/*.test.js"], fileParallelism: false, maxWorkers: 1, hookTimeout: 240000, testTimeout: 30000, reporters: ["default"] } });
