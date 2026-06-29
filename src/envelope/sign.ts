import { createHmac } from "node:crypto";

import { fingerprintPayload, fingerprintSigningKeyMaterial } from "./fingerprint";
import { canonicalizeJson } from "./serialize";
import type { ActionEnvelope, SignatureMetadata, UnsignedActionEnvelope } from "./types";

export function signEnvelope(
  envelope: UnsignedActionEnvelope,
  signingSecret: string,
  signedAt: string = new Date().toISOString(),
): ActionEnvelope {
  const payload = canonicalizeJson(envelope);
  const signature = createHmac("sha256", signingSecret).update(payload).digest("hex");
  const metadata: SignatureMetadata = {
    algorithm: "hmac-sha256",
    keyId: fingerprintSigningKeyMaterial(signingSecret),
    signature,
    signedAt,
  };

  return {
    ...envelope,
    signature: metadata,
  };
}

export function buildUnsignedEnvelopeId(envelope: Omit<UnsignedActionEnvelope, "envelopeId">): string {
  return fingerprintPayload(envelope);
}

export function verifyEnvelopeSignature(
  envelope: ActionEnvelope,
  signingSecret: string,
): boolean {
  const { signature, ...unsigned } = envelope;
  void signature;
  const expected = createHmac("sha256", signingSecret)
    .update(canonicalizeJson(unsigned))
    .digest("hex");
  return expected === envelope.signature.signature;
}
