import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { api } from "./api.ts";
import { initRepository } from "./repository/data-loader.ts";

// The API writes the local study materials, so only the vite dev client may call it from
// another origin. A built client is served from the same origin and needs no CORS at all.
const ALLOWED_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"];

await initRepository();

const app = new Hono();

app.use("*", logger());
app.use("*", cors({ origin: ALLOWED_ORIGINS }));

app.route("/api", api);

export default app;
