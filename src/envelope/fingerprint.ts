import { createHash } from "node:crypto";

import { canonicalizeJson } from "./serialize";

export function fingerprintPayload(value: unknown): string {
  return createHash("sha256").update(canonicalizeJson(value)).digest("hex");
}

export function fingerprintSigningKeyMaterial(signingSecret: string): string {
  return createHash("sha256").update(signingSecret, "utf8").digest("hex").slice(0, 16);
}
