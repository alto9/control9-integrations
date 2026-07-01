import type { ActionInputs, RuntimeMode, IacTool, CommandCategory } from "./types";
import { Control9ActionError } from "./types";

const RUNTIME_MODES: RuntimeMode[] = ["shadow", "enforce"];
const IAC_TOOLS: IacTool[] = ["terraform", "opentofu", "cdk", "cloudformation"];
const COMMAND_CATEGORIES: CommandCategory[] = [
  "plan",
  "synth",
  "diff",
  "deploy-verification",
];

export interface RawActionInputs {
  mode?: string;
  control9ApiUrl?: string;
  tenantId?: string;
  signingSecret?: string;
  targetEnvironment?: string;
  requestedAuthority?: string;
  iacTool?: string;
  command?: string;
  artifactPaths?: string;
  workingDirectory?: string;
  redactionProfile?: string;
  redactionAdditionalPatterns?: string;
  failOpenEnvironments?: string;
}

function requireNonEmpty(value: string | undefined, label: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Control9ActionError(`Missing required input: ${label}.`);
  }
  return trimmed;
}

function parseEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  label: string,
): T {
  const normalized = requireNonEmpty(value, label).toLowerCase() as T;
  if (!allowed.includes(normalized)) {
    throw new Control9ActionError(
      `Unsupported ${label}: "${value}". Expected one of: ${allowed.join(", ")}.`,
    );
  }
  return normalized;
}

function parseCommaSeparatedList(value: string | undefined, label: string): string[] {
  const raw = requireNonEmpty(value, label);
  const items = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    throw new Control9ActionError(`${label} must include at least one path.`);
  }

  return items;
}

function parseOptionalCommaSeparatedList(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFailOpenEnvironments(value: string | undefined): string[] {
  if (!value?.trim()) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const item of value.split(",")) {
    const key = item.trim().toLowerCase();
    if (key && !seen.has(key)) {
      seen.add(key);
      normalized.push(key);
    }
  }

  return normalized;
}

function validateApiUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Control9ActionError(
      `Invalid control9-api-url "${value}". Provide an absolute http or https URL.`,
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Control9ActionError(
      `Invalid control9-api-url "${value}". Only http and https URLs are supported.`,
    );
  }

  return parsed.toString().replace(/\/$/, "");
}

export function parseActionInputs(raw: RawActionInputs): ActionInputs {
  return {
    mode: parseEnum(raw.mode ?? "shadow", RUNTIME_MODES, "mode"),
    control9ApiUrl: validateApiUrl(requireNonEmpty(raw.control9ApiUrl, "control9-api-url")),
    tenantId: requireNonEmpty(raw.tenantId, "tenant-id"),
    signingSecret: requireNonEmpty(raw.signingSecret, "signing-secret"),
    targetEnvironment: requireNonEmpty(raw.targetEnvironment, "target-environment"),
    requestedAuthority: requireNonEmpty(raw.requestedAuthority, "requested-authority"),
    iacTool: parseEnum(raw.iacTool, IAC_TOOLS, "iac-tool"),
    command: parseEnum(raw.command, COMMAND_CATEGORIES, "command"),
    artifactPaths: parseCommaSeparatedList(raw.artifactPaths, "artifact-paths"),
    workingDirectory: raw.workingDirectory?.trim() || ".",
    redactionProfile: raw.redactionProfile?.trim() || undefined,
    redactionAdditionalPatterns: parseOptionalCommaSeparatedList(
      raw.redactionAdditionalPatterns,
    ),
    failOpenEnvironments: parseFailOpenEnvironments(raw.failOpenEnvironments),
  };
}

export function readActionInputsFromEnv(): ActionInputs {
  return parseActionInputs({
    mode: process.env.INPUT_MODE,
    control9ApiUrl: process.env.INPUT_CONTROL9_API_URL,
    tenantId: process.env.INPUT_TENANT_ID,
    signingSecret: process.env.INPUT_SIGNING_SECRET,
    targetEnvironment: process.env.INPUT_TARGET_ENVIRONMENT,
    requestedAuthority: process.env.INPUT_REQUESTED_AUTHORITY,
    iacTool: process.env.INPUT_IAC_TOOL,
    command: process.env.INPUT_COMMAND,
    artifactPaths: process.env.INPUT_ARTIFACT_PATHS,
    workingDirectory: process.env.INPUT_WORKING_DIRECTORY,
    redactionProfile: process.env.INPUT_REDACTION_PROFILE,
    redactionAdditionalPatterns: process.env.INPUT_REDACTION_ADDITIONAL_PATTERNS,
    failOpenEnvironments: process.env.INPUT_FAIL_OPEN_ENVIRONMENTS,
  });
}
