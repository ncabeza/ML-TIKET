import path from "node:path";
import { defineConfig, type PluginOption } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react() as PluginOption],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "..", "..", "packages", "shared", "src"),
    },
  },
});
