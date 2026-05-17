import { describe, expect, it } from "vitest";

import { RunRequestSchema, type RunRequest } from "@kordo/contracts";

import {
  DEFAULT_ALLOWED_GATEWAY_ROUTES,
  DEFAULT_ALLOWED_SANDBOX_PROFILES,
  packageName,
  validateRunRequestPolicy,
} from "./index.js";

const runRequest: RunRequest = {
  workflowId: "artifexarena.issue.fix",
  input: {
    source: "manual",
    title: "Verify policy",
  },
  sandboxProfile: "docker-local-default",
  allowedGatewayRoutes: [],
};

describe("@kordo/policy", () => {
  it("exports the package name", () => {
    expect(packageName).toBe("@kordo/policy");
  });

  it("exports default allowlists", () => {
    expect(DEFAULT_ALLOWED_SANDBOX_PROFILES).toEqual(["docker-local-default"]);
    expect(DEFAULT_ALLOWED_GATEWAY_ROUTES).toEqual([]);
  });

  it("accepts the current local run policy", () => {
    expect(validateRunRequestPolicy(runRequest)).toEqual({
      ok: true,
    });
  });

  it("rejects unknown sandbox profiles", () => {
    expect(
      validateRunRequestPolicy({
        ...runRequest,
        sandboxProfile: "microvm-default",
      }),
    ).toEqual({
      code: "SandboxProfileNotAllowed",
      message: "Sandbox profile is not allowed: microvm-default",
      ok: false,
    });
  });

  it("rejects gateway routes until gateway policy exists", () => {
    expect(
      validateRunRequestPolicy({
        ...runRequest,
        allowedGatewayRoutes: ["github.issues.write"],
      }),
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
    expect(validateRunRequestPolicy(runRequest)).toEqual({
      ok: true,
    });
  });
});
