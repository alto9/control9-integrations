import type { RuntimeMode } from "../types";

export function isFailOpenPath(
  mode: RuntimeMode,
  targetEnvironment: string,
  failOpenEnvironments: string[],
): boolean {
  if (mode === "shadow") {
    return true;
  }

  const normalizedTarget = targetEnvironment.trim().toLowerCase();
  return failOpenEnvironments.includes(normalizedTarget);
}

export function resolveApiFailureBlocksWorkflow(options: {
  failureKind: "unavailable_api" | "timeout" | "malformed_response";
  mode: RuntimeMode;
  targetEnvironment: string;
  failOpenEnvironments: string[];
}): boolean {
  if (options.failureKind === "malformed_response") {
    return true;
  }

  return !isFailOpenPath(options.mode, options.targetEnvironment, options.failOpenEnvironments);
}
