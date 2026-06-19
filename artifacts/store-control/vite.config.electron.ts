import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "strip-external-fonts",
      transformIndexHtml(html) {
        return html.replace(
          /<link[^>]+fonts\.googleapis\.com[^>]*>/g,
          ""
        ).replace(
          /<link[^>]+fonts\.gstatic\.com[^>]*>/g,
          ""
        );
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          dexie: ["dexie"],
          xlsx: ["xlsx"],
        },
      },
    },
  },
});
