import { describe, expect, it } from "vitest";

import { parseRunListQuery } from "./run-list-query.js";

describe("parseRunListQuery", () => {
  it("uses the default limit when no query parameters are provided", () => {
    expect(parseRunListQuery({})).toEqual({
      ok: true,
      value: {
        limit: 50,
      },
    });
  });

  it("accepts status and limit filters", () => {
    expect(
      parseRunListQuery({
        status: "failed",
        limit: "10",
      }),
    ).toEqual({
      ok: true,
      value: {
        status: "failed",
        limit: 10,
      },
    });
  });

  it("rejects unsupported query parameters", () => {
    expect(
      parseRunListQuery({
        workflowId: "artifexarena.issue.fix",
      }),
    ).toEqual({
      ok: false,
      message: "Unsupported query parameter: workflowId.",
    });
  });

  it("rejects invalid limit values", () => {
    expect(parseRunListQuery({ limit: "0" })).toEqual({
      ok: false,
      message: "limit must be an integer from 1 to 100.",
    });
  });

  it("rejects invalid status values", () => {
    expect(parseRunListQuery({ status: "waiting" })).toEqual({
      ok: false,
      message: "status must be one of queued, running, completed, failed, or cancelled.",
    });
  });
});
