import { fingerprintPayload } from "../envelope/fingerprint";
import type { NormalizedPlanFingerprintInput } from "./types";

export function fingerprintNormalizedPlan(input: NormalizedPlanFingerprintInput): string {
  return fingerprintPayload(input);
}
