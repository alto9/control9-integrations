import { readFileSync } from "node:fs";
import path from "node:path";
import { parseAllDocuments } from "yaml";
import { describe, expect, it } from "vitest";

const TEMPLATE_PATH = path.join(
  process.cwd(),
  "templates/control9-assessment/template.yml",
);

const EXPECTED_INPUTS = [
  "mode",
  "control9-api-url",
  "tenant-id",
  "signing-secret",
  "target-environment",
  "requested-authority",
  "iac-tool",
  "command",
  "artifact-paths",
  "working-directory",
  "redaction-profile",
  "redaction-additional-patterns",
  "fail-open-environments",
  "control9-version",
  "stage",
] as const;

const INPUT_ENV_MAP: Record<string, string> = {
  mode: "INPUT_MODE",
  "control9-api-url": "INPUT_CONTROL9_API_URL",
  "tenant-id": "INPUT_TENANT_ID",
  "signing-secret": "INPUT_SIGNING_SECRET",
  "target-environment": "INPUT_TARGET_ENVIRONMENT",
  "requested-authority": "INPUT_REQUESTED_AUTHORITY",
  "iac-tool": "INPUT_IAC_TOOL",
  command: "INPUT_COMMAND",
  "artifact-paths": "INPUT_ARTIFACT_PATHS",
  "working-directory": "INPUT_WORKING_DIRECTORY",
  "redaction-profile": "INPUT_REDACTION_PROFILE",
  "redaction-additional-patterns": "INPUT_REDACTION_ADDITIONAL_PATTERNS",
  "fail-open-environments": "INPUT_FAIL_OPEN_ENVIRONMENTS",
};

describe("GitLab component template", () => {
  it("declares all contract inputs and maps them to INPUT_* variables", () => {
    const raw = readFileSync(TEMPLATE_PATH, "utf8");
    const documents = parseAllDocuments(raw);
    expect(documents.length).toBeGreaterThanOrEqual(2);

    const spec = documents[0].toJSON() as { spec?: { inputs?: Record<string, unknown> } };
    const jobDoc = documents[1].toJSON() as {
      "control9-assessment"?: {
        variables?: Record<string, string>;
        script?: string[];
        before_script?: string[];
      };
    };

    const declaredInputs = Object.keys(spec.spec?.inputs ?? {}).sort();
    expect(declaredInputs).toEqual([...EXPECTED_INPUTS].sort());

    const job = jobDoc["control9-assessment"];
    expect(job).toBeDefined();
    expect(job?.variables?.CONTROL9_PROVIDER).toBe("gitlab");

    for (const [inputName, envName] of Object.entries(INPUT_ENV_MAP)) {
      expect(job?.variables?.[envName]).toBe(`$[[ inputs.${inputName} ]]`);
    }

    expect(job?.script).toContain("node .control9/bundle/dist/gitlab/index.js");
    expect(job?.before_script?.join("\n")).toContain("control9-bundle.tar.gz");
    expect(job?.before_script?.join("\n")).toContain("$[[ inputs.control9-version ]]");
  });
});
