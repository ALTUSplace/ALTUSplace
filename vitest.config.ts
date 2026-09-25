import { defineConfig } from "vitest/config";
import path from "path";

const templateRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: templateRoot,
  // The app build gets JSX from @vitejs/plugin-react (tsconfig sets
  // "jsx": "preserve" for it), and vitest does not load that plugin. Without
  // this, esbuild compiles .tsx with the classic runtime and any rendered
  // component throws "React is not defined".
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(templateRoot, "client", "src"),
      "@shared": path.resolve(templateRoot, "shared"),
      "@assets": path.resolve(templateRoot, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // Deterministic signing secret for server-side HMAC tests (image
    // verification proofs). Production supplies its own JWT_SECRET via env.
    env: {
      JWT_SECRET: "test-only-signing-secret",
    },
    include: [
      "server/**/*.test.ts",
      "server/**/*.spec.ts",
      "client/**/*.test.ts",
      "client/**/*.spec.ts",
      "tests/**/*.test.ts",
      "tests/**/*.spec.ts",
      "scripts/**/*.test.ts",
      "scripts/**/*.spec.ts",
    ],
  },
});
