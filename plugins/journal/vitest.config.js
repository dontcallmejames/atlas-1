import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["*.test.js"],
    environment: "node",
    reporters: "default",
  },
  resolve: {
    alias: {
      "@atlas/core/src/vault/node-vault-fs.js": new URL(
        "../../packages/core/src/vault/node-vault-fs.ts",
        import.meta.url,
      ).pathname,
    },
  },
});
