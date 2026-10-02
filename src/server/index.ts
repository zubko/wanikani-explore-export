import { createApp } from "./app.ts";
import { initRepository } from "./repository/data-loader.ts";
import { readAzureTtsConfig } from "./services/azure-tts.ts";

// A missing Azure value must stop the start, not wait for the first word add
readAzureTtsConfig();
await initRepository();

export default createApp();
