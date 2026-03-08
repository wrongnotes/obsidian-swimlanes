import type { Config } from "jest"

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "jest-environment-jsdom",
  moduleNameMapper: {
    "^obsidian$": "<rootDir>/tests/__mocks__/obsidian.ts",
  },
  setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
  coverageReporters: ["json-summary", "text"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.test.ts"],
}

export default config
