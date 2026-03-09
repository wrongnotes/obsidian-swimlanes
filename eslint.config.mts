import { fileURLToPath } from "url"
import tseslint from "typescript-eslint"
import obsidianmd from "eslint-plugin-obsidianmd"
import prettier from "eslint-config-prettier"
import globals from "globals"
import { globalIgnores } from "eslint/config"
import type { Linter } from "eslint"

export default tseslint.config(
  {
    languageOptions: {
      parser: tseslint.parser,
      globals: {
        ...globals.browser,
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.mts",
            "jest.config.ts",
            "install-plugin.ts",
            "tests/setup.ts",
            "tests/__mocks__/obsidian.ts",
          ],
        },
        tsconfigRootDir: fileURLToPath(new URL(".", import.meta.url)),
        extraFileExtensions: [".json"],
      },
    },
  },
  {
    files: ["src/**/*.ts"],
    plugins: { obsidianmd },
    // obsidianmd.configs.recommended is a legacy-style flat object of { ruleName: severity }
    rules: obsidianmd.configs?.recommended as Partial<Record<string, Linter.RuleEntry>>,
  },
  {
    files: ["**/*.test.ts", "tests/setup.ts", "tests/__mocks__/**/*.ts"],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
    },
  },
  prettier,
  // curly must come after prettier, which otherwise disables it.
  {
    files: ["**/*.ts"],
    rules: {
      curly: "error",
    },
  },
  globalIgnores([
    "node_modules",
    "dist",
    "*.mjs",
    "eslint.config.js",
    "scripts/",
    "versions.json",
    "main.js",
    "package.json",
    "install-plugin.ts",
  ]),
)
