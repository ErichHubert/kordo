import { describe, expect, it } from "vitest";

import { serviceName } from "./index.js";

describe("@kordo/control-plane", () => {
  it("exports the service name", () => {
    expect(serviceName).toBe("@kordo/control-plane");
  });
});
