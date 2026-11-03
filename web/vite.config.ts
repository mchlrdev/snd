import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "next/link": path.resolve(import.meta.dirname, "./src/shims/next-link.tsx"),
    },
  },
  server: {
    // changeOrigin off: the API sees the browser's Host (localhost:5173), so
    // its same-origin check passes and snippets show the address you opened.
    proxy: Object.fromEntries(
      ["/api", "/submit", "/mcp", "/health"].map((path) => [path, { target: "http://127.0.0.1:3000", changeOrigin: false }]),
    ),
  },
  build: {
    outDir: "../dist/public",
    emptyOutDir: true,
  },
});
