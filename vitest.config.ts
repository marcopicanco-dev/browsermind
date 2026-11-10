import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      include: [
        "src/background/**/*.ts",
        "src/database/**/*.ts",
        "src/domain/**/*.ts",
        "src/shared/**/*.ts",
      ],
      reporter: ["text", "html", "json-summary"],
    },
  },
});
