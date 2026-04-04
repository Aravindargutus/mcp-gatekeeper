import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/cli.ts", "src/index.ts"],
    },
  },
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "src/core"),
      "@connectors": path.resolve(__dirname, "src/connectors"),
      "@gates": path.resolve(__dirname, "src/gates"),
      "@reporting": path.resolve(__dirname, "src/reporting"),
      "@utils": path.resolve(__dirname, "src/utils"),
    },
  },
});
