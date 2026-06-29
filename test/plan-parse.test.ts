import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildNormalizedPlanSummary,
  countResourceActions,
  fingerprintNormalizedPlan,
  normalizeResourceAction,
  parsePlanJsonContent,
  parsePlanJsonFile,
} from "../src/plan";
import { Control9ActionError } from "../src/types";

const fixturePath = (segments: string[]): string =>
  path.join(process.cwd(), "fixtures", ...segments);

describe("parsePlanJsonContent", () => {
  it("parses supported terraform plan JSON", () => {
    const content = readFileSync(fixturePath(["terraform", "plan.json"]), "utf8");
    const plan = parsePlanJsonContent(content);

    expect(plan.format_version).toBe("1.2");
    expect(plan.resource_changes).toHaveLength(1);
  });

  it("rejects malformed JSON", () => {
    expect(() => parsePlanJsonContent("{not-json")).toThrow(Control9ActionError);
    expect(() => parsePlanJsonContent("{not-json")).toThrow(/malformed/i);
  });

  it("rejects unsupported format versions", () => {
    const content = readFileSync(
      fixturePath(["terraform", "plan-unsupported-version.json"]),
      "utf8",
    );

    expect(() => parsePlanJsonContent(content)).toThrow(Control9ActionError);
    expect(() => parsePlanJsonContent(content)).toThrow(/Unsupported Terraform\/OpenTofu plan format_version/);
  });

  it("rejects non-object JSON payloads", () => {
    expect(() => parsePlanJsonContent("[]")).toThrow(/must be a JSON object/);
  });
});

describe("normalizeResourceAction", () => {
  it("maps common terraform actions consistently", () => {
    expect(normalizeResourceAction(["create"])).toBe("create");
    expect(normalizeResourceAction(["update"])).toBe("update");
    expect(normalizeResourceAction(["delete"])).toBe("delete");
    expect(normalizeResourceAction(["no-op"])).toBe("no-op");
    expect(normalizeResourceAction(["delete", "create"])).toBe("replace");
    expect(normalizeResourceAction(["create", "delete"])).toBe("replace");
  });
});

describe("buildNormalizedPlanSummary", () => {
  it("normalizes low-risk terraform plans", () => {
    const plan = parsePlanJsonFile(fixturePath(["terraform", "plan.json"]));
    const summary = buildNormalizedPlanSummary(plan, {
      workingDirectory: ".",
      iacTool: "terraform",
    });

    expect(summary.resourceActionCounts).toEqual({
      create: 1,
      update: 0,
      delete: 0,
      replace: 0,
      "no-op": 0,
    });
    expect(summary.resourceAddresses).toEqual(["aws_s3_bucket.example"]);
    expect(summary.providerHints).toEqual(["registry.terraform.io/hashicorp/aws"]);
  });

  it("detects IAM-sensitive resources", () => {
    const plan = parsePlanJsonFile(fixturePath(["terraform", "plan-iam-sensitive.json"]));
    const summary = buildNormalizedPlanSummary(plan, {
      workingDirectory: "infra/iam",
      iacTool: "terraform",
    });

    expect(summary.resourceActionCounts.create).toBe(2);
    expect(summary.sensitiveResourceHints).toEqual([
      "aws_iam_role",
      "aws_iam_role.example",
      "aws_iam_role_policy",
      "aws_iam_role_policy.example",
    ]);
    expect(summary.targetWorkspace).toBe("infra/iam");
  });

  it("counts destructive deletes", () => {
    const plan = parsePlanJsonFile(fixturePath(["terraform", "plan-destructive.json"]));
    const summary = buildNormalizedPlanSummary(plan, {
      workingDirectory: ".",
      iacTool: "terraform",
    });

    expect(summary.resourceActionCounts).toEqual({
      create: 0,
      update: 0,
      delete: 2,
      replace: 0,
      "no-op": 0,
    });
  });

  it("handles no-op plans", () => {
    const plan = parsePlanJsonFile(fixturePath(["terraform", "plan-no-op.json"]));
    const summary = buildNormalizedPlanSummary(plan, {
      workingDirectory: ".",
      iacTool: "terraform",
    });

    expect(summary.resourceActionCounts["no-op"]).toBe(1);
  });

  it("normalizes mixed opentofu actions", () => {
    const plan = parsePlanJsonFile(fixturePath(["opentofu", "plan-mixed-actions.json"]));
    const summary = buildNormalizedPlanSummary(plan, {
      workingDirectory: "env/prod",
      iacTool: "opentofu",
    });

    expect(summary.resourceActionCounts).toEqual({
      create: 1,
      update: 1,
      delete: 0,
      replace: 1,
      "no-op": 0,
    });
    expect(countResourceActions(plan.resource_changes ?? [])).toEqual(
      summary.resourceActionCounts,
    );
  });
});

describe("fingerprintNormalizedPlan", () => {
  it("is stable for equivalent normalized plan content", () => {
    const plan = parsePlanJsonFile(fixturePath(["terraform", "plan.json"]));
    const summary = buildNormalizedPlanSummary(plan, {
      workingDirectory: ".",
      iacTool: "terraform",
    });

    const first = fingerprintNormalizedPlan(summary.planFingerprintInput);
    const second = fingerprintNormalizedPlan(summary.planFingerprintInput);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when policy-relevant plan content changes", () => {
    const lowRisk = buildNormalizedPlanSummary(
      parsePlanJsonFile(fixturePath(["terraform", "plan.json"])),
      { workingDirectory: ".", iacTool: "terraform" },
    );
    const destructive = buildNormalizedPlanSummary(
      parsePlanJsonFile(fixturePath(["terraform", "plan-destructive.json"])),
      { workingDirectory: ".", iacTool: "terraform" },
    );

    expect(
      fingerprintNormalizedPlan(lowRisk.planFingerprintInput),
    ).not.toBe(fingerprintNormalizedPlan(destructive.planFingerprintInput));
  });
});
