import type { RedactionMarker, RedactionReport } from "./types";

export interface RedactionPattern {
  valueClass: string;
  marker: string;
  pattern: RegExp;
}

const DEFAULT_REDACTION_PATTERNS: RedactionPattern[] = [
  {
    valueClass: "AWS_ACCESS_KEY",
    marker: "[REDACTED:AWS_ACCESS_KEY]",
    pattern: /AKIA[0-9A-Z]{16}/g,
  },
  {
    valueClass: "AWS_SECRET_KEY",
    marker: "[REDACTED:AWS_SECRET_KEY]",
    pattern: /(?:aws_secret_access_key|secret_key)["'\s:=]+[A-Za-z0-9/+=]{20,}/gi,
  },
  {
    valueClass: "PRIVATE_KEY",
    marker: "[REDACTED:PRIVATE_KEY]",
    pattern: /-----BEGIN [A-Z ]+ KEY-----[\s\S]*?-----END [A-Z ]+ KEY-----/g,
  },
  {
    valueClass: "GITHUB_TOKEN",
    marker: "[REDACTED:GITHUB_TOKEN]",
    pattern: /(?:ghp_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{20,})/g,
  },
  {
    valueClass: "GENERIC_SECRET",
    marker: "[REDACTED:GENERIC_SECRET]",
    pattern: /(?:password|secret|token|api[_-]?key)["'\s:=]+["']?[^\s"',}{]+/gi,
  },
];

function compileAdditionalPatterns(patterns: string[]): RedactionPattern[] {
  return patterns.map((source, index) => ({
    valueClass: `CUSTOM_${index + 1}`,
    marker: `[REDACTED:CUSTOM_${index + 1}]`,
    pattern: new RegExp(source, "g"),
  }));
}

function redactString(value: string, patterns: RedactionPattern[]): {
  redacted: string;
  markers: Map<string, RedactionMarker>;
} {
  let redacted = value;
  const markers = new Map<string, RedactionMarker>();

  for (const pattern of patterns) {
    const matches = redacted.match(pattern.pattern);
    if (!matches || matches.length === 0) {
      continue;
    }

    redacted = redacted.replace(pattern.pattern, pattern.marker);
    const existing = markers.get(pattern.marker);
    if (existing) {
      existing.count += matches.length;
    } else {
      markers.set(pattern.marker, {
        marker: pattern.marker,
        valueClass: pattern.valueClass,
        count: matches.length,
      });
    }
  }

  return { redacted, markers };
}

function mergeMarkers(
  target: Map<string, RedactionMarker>,
  source: Map<string, RedactionMarker>,
): void {
  for (const [marker, entry] of source) {
    const existing = target.get(marker);
    if (existing) {
      existing.count += entry.count;
    } else {
      target.set(marker, { ...entry });
    }
  }
}

export function redactValue(
  value: unknown,
  patterns: RedactionPattern[],
): { redacted: unknown; markers: Map<string, RedactionMarker> } {
  if (typeof value === "string") {
    const result = redactString(value, patterns);
    return { redacted: result.redacted, markers: result.markers };
  }

  if (Array.isArray(value)) {
    const markers = new Map<string, RedactionMarker>();
    const redacted = value.map((item) => {
      const result = redactValue(item, patterns);
      mergeMarkers(markers, result.markers);
      return result.redacted;
    });
    return { redacted, markers };
  }

  if (value !== null && typeof value === "object") {
    const markers = new Map<string, RedactionMarker>();
    const redacted: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const result = redactValue(nested, patterns);
      mergeMarkers(markers, result.markers);
      redacted[key] = result.redacted;
    }
    return { redacted, markers };
  }

  return { redacted: value, markers: new Map() };
}

export function redactPayload(
  value: unknown,
  profile: string,
  additionalPatterns: string[] = [],
): { redacted: unknown; report: RedactionReport } {
  const patterns = [
    ...DEFAULT_REDACTION_PATTERNS,
    ...compileAdditionalPatterns(additionalPatterns),
  ];
  const result = redactValue(value, patterns);
  const markers = [...result.markers.values()].sort((left, right) =>
    left.marker.localeCompare(right.marker),
  );
  const totalRedactions = markers.reduce((sum, marker) => sum + marker.count, 0);

  return {
    redacted: result.redacted,
    report: {
      profile,
      markers,
      totalRedactions,
    },
  };
}

export function containsRawSecretMarkers(value: unknown, patterns: string[] = []): boolean {
  const serialized = JSON.stringify(value);
  const allPatterns = [
    ...DEFAULT_REDACTION_PATTERNS,
    ...compileAdditionalPatterns(patterns),
  ];

  return allPatterns.some((pattern) => {
    pattern.pattern.lastIndex = 0;
    return pattern.pattern.test(serialized);
  });
}
