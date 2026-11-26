import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"
import prettier from "eslint-config-prettier/flat"

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    // Tenant isolation (phase.md §4.3 rule 2): only the data layer may touch the raw
    // MongoDB client. Everything else goes through tenant-scoped repositories.
    files: ["src/**/*.{ts,tsx}"],
    ignores: [
      "src/server/db/**",
      "src/server/auth/**",
      "src/server/audit/**",
      "src/server/modules/tenants.ts",
      "src/server/rate-limit.ts",
      "src/test/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/server/db/client",
              message:
                "Use a tenant-scoped repository from @/server/repositories instead of the raw client.",
            },
          ],
        },
      ],
    },
  },
  {
    // Client code must never pull in server modules (secrets, DB). `server-only` also guards this.
    files: ["src/components/**/*.tsx", "src/lib/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@/server/*"], message: "Server code can't be imported here." }] },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    ".data/**",
  ]),
])

export default eslintConfig
