import { describe, expect, it } from "bun:test";
import { HttpStatusError } from "@client/utils/http-error.ts";

describe("HttpStatusError", () => {
  it("carries the status and builds the message", () => {
    const err = new HttpStatusError(500);
    expect(err.status).toBe(500);
    expect(err.message).toBe("Server error (500)");
    expect(err.name).toBe("HttpStatusError");
    expect(err).toBeInstanceOf(Error);
  });
});
