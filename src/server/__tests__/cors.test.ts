import { describe, test, expect } from "bun:test";
import app from "../index.ts";

async function allowedOriginFor(origin: string): Promise<string | null> {
  const response = await app.request("/api/study-materials", {
    method: "OPTIONS",
    headers: { Origin: origin, "Access-Control-Request-Method": "PATCH" },
  });
  return response.headers.get("access-control-allow-origin");
}

describe("CORS", () => {
  test("the vite dev client may call the API", async () => {
    expect(await allowedOriginFor("http://localhost:5173")).toBe("http://localhost:5173");
    expect(await allowedOriginFor("http://127.0.0.1:5173")).toBe("http://127.0.0.1:5173");
  });

  test("any other page may not", async () => {
    expect(await allowedOriginFor("http://evil.example")).toBeNull();
    expect(await allowedOriginFor("http://localhost:3000")).toBeNull();
  });
});
