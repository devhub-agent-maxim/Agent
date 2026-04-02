/** @type {import('jest').Config} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src/__tests__"],
  testMatch: ["**/*.test.ts"],
  moduleNameMapper: {
    // Mirror the @/* path alias from tsconfig.json
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          // Override Next.js-specific tsconfig settings that break Jest/CommonJS
          module: "commonjs",
          moduleResolution: "node",
          jsx: "react",
        },
      },
    ],
  },
  collectCoverageFrom: [
    "src/server/**/*.ts",
    "!src/**/*.d.ts",
  ],
  coverageDirectory: "coverage",
};
