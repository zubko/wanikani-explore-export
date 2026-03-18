import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { api } from "./api.ts";
import { initRepository } from "./repository/data-loader.ts";

await initRepository();

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.route("/api", api);

export default app;
