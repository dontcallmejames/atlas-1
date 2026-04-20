import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Allow importing .ts source files via .js extensions (TypeScript ESM convention).
    extensions: [".ts", ".js"],
    alias: {
      // Expose the Node-only vault driver that is intentionally not re-exported
      // from @atlas/core (webview tree-shaking). Tests import it via the subpath
      // @atlas/core/src/vault/node-vault-fs.js which Vite cannot resolve without
      // an explicit alias because @atlas/core has no "exports" map.
      "@atlas/core/src/vault/node-vault-fs.js": resolve(
        __dirname,
        "../../packages/core/src/vault/node-vault-fs.ts",
      ),
    },
  },
  test: {
    include: ["*.test.js"],
    environment: "node",
    reporters: "default",
  },
});
