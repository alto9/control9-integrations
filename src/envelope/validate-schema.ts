import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

import { Control9ActionError } from "../types";
import actionEnvelopeSchema from "../../.ai/schemas/action-envelope.schema.json";
import type { ActionEnvelope } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const validateEnvelope = ajv.compile(actionEnvelopeSchema);

export function validateActionEnvelopeSchema(envelope: ActionEnvelope): void {
  const valid = validateEnvelope(envelope);
  if (valid) {
    return;
  }

  const details =
    validateEnvelope.errors
      ?.map((error) => {
        const path = error.instancePath || "(root)";
        return `${path} ${error.message ?? "is invalid"}`.trim();
      })
      .join("; ") ?? "unknown validation error";

  throw new Control9ActionError(`Action envelope failed schema validation: ${details}.`);
}
