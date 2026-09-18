import { describe, expect, it } from "bun:test";
import { HttpStatusError } from "@client/utils/http-error.ts";
import {
  SERVER_UNREACHABLE_MESSAGE,
  saveErrorMessage,
  searchErrorMessage,
} from "@client/utils/request-error.ts";

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

describe("saveErrorMessage", () => {
  it("uses the message of an HttpStatusError", () => {
    expect(saveErrorMessage(new HttpStatusError(500))).toBe("Server error (500)");
  });

  it("reports an unreachable server for a fetch TypeError", () => {
    expect(saveErrorMessage(new TypeError("Failed to fetch"))).toBe(SERVER_UNREACHABLE_MESSAGE);
  });

  it("shows the message of any other Error as it is", () => {
    expect(saveErrorMessage(new Error("Subject not found"))).toBe("Subject not found");
    expect(saveErrorMessage("boom")).toBe("boom");
  });
});
