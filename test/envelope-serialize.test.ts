import { describe, expect, it } from "vitest";

import { canonicalizeJson, sortKeys } from "../src/envelope/serialize";

describe("canonicalizeJson", () => {
  it("sorts object keys deterministically", () => {
    const first = canonicalizeJson({ z: 1, a: 2, m: { b: 1, a: 2 } });
    const second = canonicalizeJson({ a: 2, m: { a: 2, b: 1 }, z: 1 });

    expect(first).toBe(second);
    expect(first).toBe('{"a":2,"m":{"a":2,"b":1},"z":1}');
  });

  it("preserves array order", () => {
    expect(sortKeys([{ b: 1, a: 2 }, { d: 3, c: 4 }])).toEqual([
      { a: 2, b: 1 },
      { c: 4, d: 3 },
    ]);
  });
});
