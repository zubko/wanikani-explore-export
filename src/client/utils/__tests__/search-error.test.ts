import { describe, expect, it } from "bun:test";

import {
  HttpStatusError,
  SERVER_UNREACHABLE_MESSAGE,
  searchErrorMessage,
} from "@client/utils/search-error.ts";

describe("HttpStatusError", () => {
  it("carries the status and builds the message", () => {
    const err = new HttpStatusError(500);
    expect(err.status).toBe(500);
    expect(err.message).toBe("Server error (500)");
    expect(err.name).toBe("HttpStatusError");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("searchErrorMessage", () => {
  it("uses the message of an HttpStatusError", () => {
    expect(searchErrorMessage(new HttpStatusError(500))).toBe("Server error (500)");
    expect(searchErrorMessage(new HttpStatusError(502))).toBe("Server error (502)");
  });

  it("reports an unreachable server for a fetch TypeError", () => {
    expect(searchErrorMessage(new TypeError("Failed to fetch"))).toBe(SERVER_UNREACHABLE_MESSAGE);
    expect(searchErrorMessage(new TypeError("Load failed"))).toBe(SERVER_UNREACHABLE_MESSAGE);
  });

  it("falls back to the message of any other Error", () => {
    expect(searchErrorMessage(new Error("Unexpected token <"))).toBe(
      "Search failed: Unexpected token <"
    );
    expect(searchErrorMessage(new SyntaxError("Unexpected token <"))).toBe(
      "Search failed: Unexpected token <"
    );
  });

  it("falls back to the string form of a non-Error value", () => {
    expect(searchErrorMessage("boom")).toBe("Search failed: boom");
    expect(searchErrorMessage(undefined)).toBe("Search failed: undefined");
  });
});
