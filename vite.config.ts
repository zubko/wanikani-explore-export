import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import devServer from "@hono/vite-dev-server";
import path from "path";

export default defineConfig(({ mode }) => {
  // Load all .env vars into process.env so the Hono server can access them.
  // Empty prefix '' loads all vars, not just VITE_-prefixed ones.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ""));

  const port = process.env.PORT ? Number(process.env.PORT) : undefined;

  return {
    server: {
      port,
      // The Claude desktop preview passes a free port in PORT and opens exactly that port.
      strictPort: port !== undefined,
    },
    plugins: [
      react(),
      tailwindcss(),
      devServer({
        entry: "src/server/index.ts",
        exclude: [/^(?!\/api\/).*/],
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@client": path.resolve(__dirname, "src/client"),
        "@server": path.resolve(__dirname, "src/server"),
      },
    },
    build: {
      outDir: "dist/client",
      emptyOutDir: true,
    },
  };
});
