import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Read VITE_* variables from the repo-root .env, next to the server's settings.
  envDir: "../..",
  server: { port: 5173, strictPort: true },
});
