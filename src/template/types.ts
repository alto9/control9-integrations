import type { NormalizedResourceAction } from "../plan/types";

export interface CloudFormationResource {
  Type?: string;
  Properties?: Record<string, unknown>;
  Metadata?: Record<string, unknown>;
}

export interface CloudFormationTemplate {
  AWSTemplateFormatVersion?: string;
  Description?: string;
  Parameters?: Record<string, unknown>;
  Mappings?: Record<string, unknown>;
  Conditions?: Record<string, unknown>;
  Resources?: Record<string, CloudFormationResource>;
  Outputs?: Record<string, unknown>;
  Metadata?: Record<string, unknown>;
}

export interface NormalizedTemplateFingerprintInput {
  templateFormatVersion: string;
  resourceActionCounts: Record<string, number>;
  resourceLogicalIds: string[];
  resourceTypes: string[];
  sensitiveResourceHints: string[];
  stackNames: string[];
  accountHints: string[];
  regionHints: string[];
}

export interface NormalizedTemplateSummary {
  resourceActionCounts: Record<NormalizedResourceAction, number>;
  resourceLogicalIds: string[];
  resourceTypes: string[];
  sensitiveResourceHints: string[];
  stackNames: string[];
  accountHints: string[];
  regionHints: string[];
  templateFormatVersion: string;
  sourceTool: "cdk" | "cloudformation";
  templateFingerprintInput: NormalizedTemplateFingerprintInput;
}
