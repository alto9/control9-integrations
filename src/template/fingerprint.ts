import { fingerprintPayload } from "../envelope/fingerprint";
import type { NormalizedTemplateFingerprintInput } from "./types";

export function fingerprintNormalizedTemplate(
  input: NormalizedTemplateFingerprintInput,
): string {
  return fingerprintPayload(input);
}
