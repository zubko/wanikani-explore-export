import { describe, expect, it } from "bun:test";
import { getErrorMessage } from "../error-message.ts";

describe("getErrorMessage", () => {
  it("answers the message of an Error", () => {
    expect(getErrorMessage(new Error("disk full"))).toBe("disk full");
  });

  it("answers the message of an object, like an AnkiConnect error", () => {
    expect(getErrorMessage({ message: "deck not found", action: "findNotes" })).toBe(
      "deck not found"
    );
  });

  it("answers a string as it is", () => {
    expect(getErrorMessage("timeout")).toBe("timeout");
  });

  it("turns a number into text", () => {
    expect(getErrorMessage(42)).toBe("42");
  });

  it("turns null into text", () => {
    expect(getErrorMessage(null)).toBe("null");
  });
});
