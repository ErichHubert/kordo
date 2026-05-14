import { describe, expect, it } from "vitest";

import { packageName } from "./index.js";

describe("@kordo/contracts", () => {
  it("exports the package name", () => {
    expect(packageName).toBe("@kordo/contracts");
  });
});
