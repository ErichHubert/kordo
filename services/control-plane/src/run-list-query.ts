import { RunStatusSchema, type RunStatus } from "@kordo/contracts";

import type { ListRunsOptions } from "./repositories/run-repository.js";

const DEFAULT_RUN_LIST_LIMIT = 50;
const MAX_RUN_LIST_LIMIT = 100;

export type ParsedRunListQuery =
  | {
      ok: true;
      value: ListRunsOptions;
    }
  | {
      ok: false;
      message: string;
    };

export function parseRunListQuery(query: unknown): ParsedRunListQuery {
  if (query !== undefined && (!query || typeof query !== "object" || Array.isArray(query))) {
    return {
      ok: false,
      message: "Query string must be an object.",
    };
  }

  const rawQuery = (query ?? {}) as Record<string, unknown>;
  const supportedKeys = new Set(["limit", "status"]);
  const unsupportedKey = Object.keys(rawQuery).find((key) => !supportedKeys.has(key));

  if (unsupportedKey) {
    return {
      ok: false,
      message: `Unsupported query parameter: ${unsupportedKey}.`,
    };
  }

  const parsedLimit = parseRunListLimit(rawQuery.limit);

  if (!parsedLimit.ok) {
    return parsedLimit;
  }

  const parsedStatus = parseRunListStatus(rawQuery.status);

  if (!parsedStatus.ok) {
    return parsedStatus;
  }

  return {
    ok: true,
    value: {
      limit: parsedLimit.value,
      ...(parsedStatus.value ? { status: parsedStatus.value } : {}),
    },
  };
}

function parseRunListLimit(rawLimit: unknown):
  | {
      ok: true;
      value: number;
    }
  | {
      ok: false;
      message: string;
    } {
  if (rawLimit === undefined) {
    return {
      ok: true,
      value: DEFAULT_RUN_LIST_LIMIT,
    };
  }

  if (typeof rawLimit !== "string" || rawLimit.trim() === "") {
    return {
      ok: false,
      message: "limit must be an integer query parameter.",
    };
  }

  const limit = Number(rawLimit);

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RUN_LIST_LIMIT) {
    return {
      ok: false,
      message: `limit must be an integer from 1 to ${MAX_RUN_LIST_LIMIT}.`,
    };
  }

  return {
    ok: true,
    value: limit,
  };
}

function parseRunListStatus(rawStatus: unknown):
  | {
      ok: true;
      value?: RunStatus;
    }
  | {
      ok: false;
      message: string;
    } {
  if (rawStatus === undefined) {
    return {
      ok: true,
    };
  }

  if (typeof rawStatus !== "string") {
    return {
      ok: false,
      message: "status must be a string query parameter.",
    };
  }

  const parsed = RunStatusSchema.safeParse(rawStatus);

  if (!parsed.success) {
    return {
      ok: false,
      message: "status must be one of queued, running, completed, failed, or cancelled.",
    };
  }

  return {
    ok: true,
    value: parsed.data,
  };
}
