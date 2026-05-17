import type { RunRequest } from "@kordo/contracts";

export const packageName = "@kordo/policy";

export const DEFAULT_ALLOWED_SANDBOX_PROFILES = ["docker-local-default"] as const;

export const DEFAULT_ALLOWED_GATEWAY_ROUTES = [] as const;

export type RunPolicyRejectionCode = "SandboxProfileNotAllowed" | "GatewayRouteNotAllowed";

export interface RunPolicyAccepted {
  ok: true;
}

export interface RunPolicyRejected {
  code: RunPolicyRejectionCode;
  message: string;
  ok: false;
}

export type RunPolicyResult = RunPolicyAccepted | RunPolicyRejected;

export interface RunPolicy {
  allowedGatewayRoutes: readonly string[];
  allowedSandboxProfiles: readonly string[];
}

export const defaultRunPolicy: RunPolicy = {
  allowedGatewayRoutes: DEFAULT_ALLOWED_GATEWAY_ROUTES,
  allowedSandboxProfiles: DEFAULT_ALLOWED_SANDBOX_PROFILES,
};

export function validateRunRequestPolicy(
  request: RunRequest,
  policy: RunPolicy = defaultRunPolicy,
): RunPolicyResult {
  if (!policy.allowedSandboxProfiles.includes(request.sandboxProfile)) {
    return {
      code: "SandboxProfileNotAllowed",
      message: `Sandbox profile is not allowed: ${request.sandboxProfile}`,
      ok: false,
    };
  }

  const rejectedGatewayRoute = request.allowedGatewayRoutes.find(
    (route) => !policy.allowedGatewayRoutes.includes(route),
  );

  if (rejectedGatewayRoute) {
    return {
      code: "GatewayRouteNotAllowed",
      message: `Gateway route is not allowed: ${rejectedGatewayRoute}`,
      ok: false,
    };
  }

  return { ok: true };
}
