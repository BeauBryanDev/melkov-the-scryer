import { defineConfig } from "vite";

export default defineConfig({
  // Everything in public/ is served as-is at the site root:
  // ONNX models, Piper-independent assets, vendored MediaPipe bundles.
  publicDir: "public",

  server: {
    port: 3000,
    strictPort: true,
  },

  build: {
    outDir: "dist",
    target: "es2022",
    // Shaders and pages are small; keep a single readable bundle per page
    // via the router's dynamic imports (Vite code-splits those for free).
  },

  resolve: {
    alias: {
      "@": "/src",
    },
  },
});
