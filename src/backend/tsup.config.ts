import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/scripts/migrate.ts"],
  format: ["cjs"],
  outDir: "dist",
  // Bundle @teko/shared inline — its package.json points to TypeScript source
  // which Node cannot execute directly from the symlink.
  noExternal: ["@teko/shared"],
});
