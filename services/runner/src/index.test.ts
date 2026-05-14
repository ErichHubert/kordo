import { describe, expect, it } from "vitest";

import { serviceName } from "./index.js";

describe("@kordo/runner", () => {
  it("exports the service name", () => {
    expect(serviceName).toBe("@kordo/runner");
  });
});
