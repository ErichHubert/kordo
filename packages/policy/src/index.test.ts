import { describe, expect, it } from "vitest";

import { RunRequestSchema, type RunRequest } from "@kordo/contracts";

import { packageName, validateRunRequestPolicy, type RunPolicy } from "./index.js";

const runRequest: RunRequest = {
  workflowId: "artifexarena.issue.fix",
  input: {
    source: "manual",
    title: "Verify policy",
  },
  sandboxProfile: "docker-local-default",
  allowedGatewayRoutes: [],
};

const localRunPolicy: RunPolicy = {
  allowedGatewayRoutes: [],
  allowedSandboxProfiles: ["docker-local-default"],
};

describe("@kordo/policy", () => {
  it("exports the package name", () => {
    expect(packageName).toBe("@kordo/policy");
  });

  it("accepts a request that matches the provided policy", () => {
    expect(validateRunRequestPolicy(runRequest, localRunPolicy)).toEqual({
      ok: true,
    });
  });

  it("rejects unknown sandbox profiles", () => {
    expect(
      validateRunRequestPolicy(
        {
          ...runRequest,
          sandboxProfile: "microvm-default",
        },
        localRunPolicy,
      ),
    ).toEqual({
      code: "SandboxProfileNotAllowed",
      message: "Sandbox profile is not allowed: microvm-default",
      ok: false,
    });
  });

  it("rejects gateway routes until gateway policy exists", () => {
    expect(
      validateRunRequestPolicy(
        {
          ...runRequest,
          allowedGatewayRoutes: ["github.issues.write"],
        },
        localRunPolicy,
      ),
    ).toEqual({
      code: "GatewayRouteNotAllowed",
      message: "Gateway route is not allowed: github.issues.write",
      ok: false,
    });
  });

  it("keeps contract validation separate from policy validation", () => {
    const parsed = RunRequestSchema.safeParse({
      ...runRequest,
      workflowId: "",
    });

    expect(parsed.success).toBe(false);
    expect(validateRunRequestPolicy(runRequest, localRunPolicy)).toEqual({
      ok: true,
    });
  });
});
