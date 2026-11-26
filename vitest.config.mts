import { fileURLToPath } from "node:url"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/empty.ts", import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        // Logic and components: fast, no database. Sits next to the code as *.test.ts(x).
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.int.test.ts"],
          css: false,
        },
      },
      {
        // Data layer and services against a real mongod replica set (mongodb-memory-server).
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.int.test.ts"],
          globalSetup: ["./src/test/global-db.ts"],
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["src/components/**", "src/lib/**", "src/server/**"],
      exclude: ["src/components/ui/**", "**/*.test.{ts,tsx}"],
      reporter: ["text", "html"],
    },
  },
})
