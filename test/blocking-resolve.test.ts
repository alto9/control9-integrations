import { describe, expect, it } from "vitest";

import {
  isFailOpenPath,
  resolveApiFailureBlocksWorkflow,
} from "../src/blocking/resolve-blocking";

describe("isFailOpenPath", () => {
  it("returns true for shadow mode regardless of environment list", () => {
    expect(isFailOpenPath("shadow", "production", [])).toBe(true);
    expect(isFailOpenPath("shadow", "production", ["staging"])).toBe(true);
  });

  it("returns true for enforce mode when target environment is listed", () => {
    expect(isFailOpenPath("enforce", "staging", ["staging", "dev"])).toBe(true);
    expect(isFailOpenPath("enforce", "STAGING", ["staging"])).toBe(true);
    expect(isFailOpenPath("enforce", "  dev  ", ["dev"])).toBe(true);
  });

  it("returns false for enforce mode when target environment is not listed", () => {
    expect(isFailOpenPath("enforce", "production", [])).toBe(false);
    expect(isFailOpenPath("enforce", "production", ["staging", "dev"])).toBe(false);
  });
});

describe("resolveApiFailureBlocksWorkflow", () => {
  it.each([
    ["unavailable_api", "shadow", "production", [], false],
    ["timeout", "shadow", "production", [], false],
    ["unavailable_api", "enforce", "production", [], true],
    ["timeout", "enforce", "production", [], true],
    ["unavailable_api", "enforce", "staging", ["staging"], false],
    ["timeout", "enforce", "dev", ["staging", "dev"], false],
    ["malformed_response", "shadow", "production", [], true],
    ["malformed_response", "enforce", "staging", ["staging"], true],
  ] as const)(
    "blocks=%s for %s in %s with fail-open list %j => %s",
    (failureKind, mode, targetEnvironment, failOpenEnvironments, blocksWorkflow) => {
      expect(
        resolveApiFailureBlocksWorkflow({
          failureKind,
          mode,
          targetEnvironment,
          failOpenEnvironments,
        }),
      ).toBe(blocksWorkflow);
    },
  );
});
