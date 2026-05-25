import { afterEach, describe, expect, it, vi } from "vitest";

describe("Kordo Hatchet client module", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not import deprecated Hatchet root modules", async () => {
    vi.resetModules();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await import("./client.js");

    expect(warn).not.toHaveBeenCalled();
  });
});
