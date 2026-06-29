export const SUPPORTED_PLAN_FORMAT_VERSIONS = new Set(["1.0", "1.1", "1.2"]);

export type NormalizedResourceAction =
  | "create"
  | "update"
  | "delete"
  | "replace"
  | "no-op";

export interface TerraformPlanResourceChange {
  address?: string;
  type?: string;
  provider_name?: string;
  change?: {
    actions?: string[];
  };
}

export interface TerraformPlanJson {
  format_version?: string;
  terraform_version?: string;
  workspace?: {
    backend?: {
      type?: string;
    };
    terraform_version?: string;
  };
  resource_changes?: TerraformPlanResourceChange[];
  variables?: Record<string, unknown>;
  output_changes?: Record<string, unknown>;
}

export interface NormalizedPlanSummary {
  resourceActionCounts: Record<NormalizedResourceAction, number>;
  resourceAddresses: string[];
  providerHints: string[];
  sensitiveResourceHints: string[];
  targetWorkspace?: string;
  formatVersion: string;
  planFingerprintInput: NormalizedPlanFingerprintInput;
}

export interface NormalizedPlanFingerprintInput {
  formatVersion: string;
  resourceActionCounts: Record<string, number>;
  resourceAddresses: string[];
  providerHints: string[];
  sensitiveResourceHints: string[];
}
