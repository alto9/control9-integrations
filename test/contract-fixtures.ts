import { readFileSync } from "node:fs";

export interface FailureScenarioFixture {
  description?: string;
  httpStatus: number;
  body?: Record<string, unknown>;
  attempts?: number;
  expectedFailureKind: string;
  expectedDetailPattern?: string;
}

export function loadJsonFixture<T>(relativePath: string): T {
  return JSON.parse(readFileSync(relativePath, "utf8")) as T;
}

const stubEnvelope = {
  envelopeId: "a".repeat(64),
} as never;

export function stubSubmitEnvelopeRequest() {
  return { envelope: stubEnvelope };
}
