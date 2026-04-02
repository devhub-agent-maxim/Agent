/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { tsconfig: { module: "commonjs" } }],
    "^.+\\.jsx?$": ["ts-jest", { tsconfig: { module: "commonjs", allowJs: true } }],
  },
  transformIgnorePatterns: [
    "node_modules/(?!(superjson|copy-anything|is-what|@trpc)/)",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  testMatch: ["**/__tests__/**/*.test.ts"],
  passWithNoTests: true,
};
