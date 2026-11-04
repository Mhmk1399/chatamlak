import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { visualizer } from "rollup-plugin-visualizer";

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, path.resolve(import.meta.dirname, ".."), "");
  const apiPort = Number(
    rootEnv.SERVER_PORT ||
      rootEnv.PORT ||
      process.env.SERVER_PORT ||
      process.env.PORT ||
      5174,
  );
  const analyze =
    String(rootEnv.ANALYZE || process.env.ANALYZE || "").toLowerCase() ===
    "true";

  return {
    plugins: [
      react(),
      ...(analyze
        ? [
            visualizer({
              filename: "dist/stats.html",
              gzipSize: true,
              brotliSize: true,
              open: false,
            }),
          ]
        : []),
    ],
    envDir: "..",
    envPrefix: ["APP_", "CHAT_", "FILE_", "MESSAGE_", "ACCOUNT_", "SIGN_"],
    build: {
      chunkSizeWarningLimit: 800,
      rollupOptions: {
        output: {
          codeSplitting: {
            // Keep shared React in its owner instead of hoisting it into the lazy calendar chunk.
            includeDependenciesRecursively: false,
            groups: [
              { name: "react-core", test: /\/node_modules\/(?:react|react-dom|scheduler)\//, priority: 40 },
              { name: "date-controls", test: /\/node_modules\/(?:react-aria(?:-components)?|react-stately|@react-aria|@react-stately|@react-types|@internationalized)\//, priority: 30 },
              { name: "icons", test: /\/node_modules\/lucide-react\//, priority: 20 },
              { name: "markdown", test: /\/node_modules\/(?:marked|dompurify|highlight.js)\//, priority: 20 },
              { name: "vendor", test: /\/node_modules\//, priority: 0 },
            ],
          },
        },
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        "/api": `http://localhost:${apiPort}`,
        "/ws": {
          target: `http://localhost:${apiPort}`,
          ws: true,
        },
      },
    },
  };
});
