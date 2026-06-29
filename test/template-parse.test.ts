import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildDiffTemplateSummary,
  buildNormalizedTemplateSummary,
  buildSynthTemplateSummary,
  fingerprintNormalizedTemplate,
  parseTemplateContent,
  parseTemplateFile,
} from "../src/template";
import { Control9ActionError } from "../src/types";

const fixturePath = (segments: string[]): string =>
  path.join(process.cwd(), "fixtures", ...segments);

describe("parseTemplateContent", () => {
  it("parses synthesized CDK template JSON", () => {
    const content = readFileSync(fixturePath(["cdk", "stack.template.json"]), "utf8");
    const template = parseTemplateContent(content);

    expect(template.Resources?.ExampleBucket?.Type).toBe("AWS::S3::Bucket");
  });

  it("parses synthesized CloudFormation template JSON", () => {
    const content = readFileSync(fixturePath(["cloudformation", "template.json"]), "utf8");
    const template = parseTemplateContent(content);

    expect(template.Resources?.ExampleQueue?.Type).toBe("AWS::SQS::Queue");
  });

  it("parses YAML templates when the artifact path uses a yaml extension", () => {
    const content = readFileSync(fixturePath(["cdk", "stack.template.yaml"]), "utf8");
    const template = parseTemplateContent(content, fixturePath(["cdk", "stack.template.yaml"]));

    expect(template.Resources?.ExampleTable?.Type).toBe("AWS::DynamoDB::Table");
  });

  it("rejects malformed JSON templates", () => {
    expect(() => parseTemplateContent("{not-json")).toThrow(Control9ActionError);
    expect(() => parseTemplateContent("{not-json")).toThrow(/malformed/i);
  });

  it("rejects templates without Resources", () => {
    const content = readFileSync(fixturePath(["cdk", "template-malformed.json"]), "utf8");

    expect(() => parseTemplateContent(content)).toThrow(Control9ActionError);
    expect(() => parseTemplateContent(content)).toThrow(/Resources object/);
  });

  it("rejects terraform plan JSON passed as a template artifact", () => {
    const content = readFileSync(fixturePath(["terraform", "plan.json"]), "utf8");

    expect(() => parseTemplateContent(content)).toThrow(Control9ActionError);
    expect(() => parseTemplateContent(content)).toThrow(/Terraform\/OpenTofu plan JSON/);
  });
});

describe("buildSynthTemplateSummary", () => {
  it("normalizes synthesized CDK templates with create actions", () => {
    const template = parseTemplateFile(fixturePath(["cdk", "stack.template.json"]));
    const summary = buildSynthTemplateSummary(template, {
      iacTool: "cdk",
      artifactPath: "fixtures/cdk/stack.template.json",
    });

    expect(summary.resourceActionCounts).toEqual({
      create: 1,
      update: 0,
      delete: 0,
      replace: 0,
      "no-op": 0,
    });
    expect(summary.resourceLogicalIds).toEqual(["ExampleBucket"]);
    expect(summary.resourceTypes).toEqual(["AWS::S3::Bucket"]);
    expect(summary.sourceTool).toBe("cdk");
    expect(summary.stackNames).toEqual(["stack"]);
  });

  it("detects IAM-sensitive resources", () => {
    const template = parseTemplateFile(fixturePath(["cdk", "template-iam-sensitive.json"]));
    const summary = buildSynthTemplateSummary(template, {
      iacTool: "cdk",
      artifactPath: "fixtures/cdk/template-iam-sensitive.json",
    });

    expect(summary.resourceActionCounts.create).toBe(2);
    expect(summary.sensitiveResourceHints).toEqual([
      "AWS::IAM::Policy",
      "AWS::IAM::Role",
      "ExamplePolicy",
      "ExampleRole",
    ]);
    expect(summary.accountHints).toEqual(["123456789012"]);
    expect(summary.regionHints).toEqual(["us-east-1"]);
  });

  it("detects networking-sensitive resources", () => {
    const template = parseTemplateFile(
      fixturePath(["cdk", "template-networking-sensitive.json"]),
    );
    const summary = buildSynthTemplateSummary(template, {
      iacTool: "cloudformation",
      artifactPath: "fixtures/cdk/template-networking-sensitive.json",
    });

    expect(summary.sensitiveResourceHints).toEqual([
      "AWS::EC2::SecurityGroup",
      "AWS::EC2::VPC",
      "ExampleSecurityGroup",
      "ExampleVpc",
    ]);
    expect(summary.sourceTool).toBe("cloudformation");
  });
});

describe("buildDiffTemplateSummary", () => {
  it("derives create, update, and delete actions from template pairs", () => {
    const before = parseTemplateFile(fixturePath(["cdk", "template-before.json"]));
    const after = parseTemplateFile(fixturePath(["cdk", "template-after.json"]));
    const summary = buildDiffTemplateSummary(before, after, {
      iacTool: "cdk",
      beforeArtifactPath: "fixtures/cdk/template-before.json",
      afterArtifactPath: "fixtures/cdk/template-after.json",
    });

    expect(summary.resourceActionCounts).toEqual({
      create: 1,
      update: 1,
      delete: 1,
      replace: 0,
      "no-op": 0,
    });
    expect(summary.resourceLogicalIds).toEqual([
      "ExampleBucket",
      "LegacyQueue",
      "NewTopic",
    ]);
  });
});

describe("buildNormalizedTemplateSummary", () => {
  it("rejects ambiguous single-artifact diff combinations", () => {
    const template = parseTemplateFile(fixturePath(["cloudformation", "template.json"]));

    expect(() =>
      buildNormalizedTemplateSummary([template], {
        iacTool: "cloudformation",
        command: "diff",
        artifactPaths: ["fixtures/cloudformation/template.json"],
      }),
    ).toThrow(/before-and-after template pair/);
  });
});

describe("fingerprintNormalizedTemplate", () => {
  it("is stable for equivalent normalized template content", () => {
    const template = parseTemplateFile(fixturePath(["cdk", "stack.template.json"]));
    const summary = buildSynthTemplateSummary(template, {
      iacTool: "cdk",
      artifactPath: "fixtures/cdk/stack.template.json",
    });

    const first = fingerprintNormalizedTemplate(summary.templateFingerprintInput);
    const second = fingerprintNormalizedTemplate(summary.templateFingerprintInput);

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when policy-relevant template content changes", () => {
    const lowRisk = buildSynthTemplateSummary(
      parseTemplateFile(fixturePath(["cdk", "stack.template.json"])),
      { iacTool: "cdk", artifactPath: "fixtures/cdk/stack.template.json" },
    );
    const iamSensitive = buildSynthTemplateSummary(
      parseTemplateFile(fixturePath(["cdk", "template-iam-sensitive.json"])),
      { iacTool: "cdk", artifactPath: "fixtures/cdk/template-iam-sensitive.json" },
    );

    expect(
      fingerprintNormalizedTemplate(lowRisk.templateFingerprintInput),
    ).not.toBe(fingerprintNormalizedTemplate(iamSensitive.templateFingerprintInput));
  });
});
