import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["**/*.test.ts", "**/*.spec.ts"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "packages/shared/src"),
    },
  },
});
