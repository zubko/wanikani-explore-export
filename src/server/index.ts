import { createApp } from "./app.ts";
import { initRepository } from "./repository/data-loader.ts";

await initRepository();

export default createApp();
