export { fingerprintNormalizedPlan } from "./fingerprint";
export { buildNormalizedPlanSummary, countResourceActions, normalizeResourceAction } from "./normalize";
export { parsePlanJsonContent, parsePlanJsonFile } from "./parse";
export type {
  NormalizedPlanFingerprintInput,
  NormalizedPlanSummary,
  NormalizedResourceAction,
  TerraformPlanJson,
} from "./types";
export { SUPPORTED_PLAN_FORMAT_VERSIONS } from "./types";
