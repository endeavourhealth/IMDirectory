import { describe, expect, it } from "vitest";
import { IM } from "@endeavour/vue-library/enums";
import type { Query, SearchResponse } from "@endeavour/vue-library/models";
import { type ComparedMember, addMemberToDefinition, compareMembers, isInactive, isTruncated } from "@/helpers/MemberComparison";

const INACTIVE = "http://endhealth.info/im#Inactive";

function response(names: string[], totalCount?: number, inactive: string[] = []): SearchResponse {
  return {
    totalCount,
    entities: names.map(name => ({
      iri: "http://snomed.info/sct#" + name,
      name,
      type: [],
      status: { iri: inactive.includes(name) ? INACTIVE : IM.ACTIVE }
    }))
  };
}

describe("compareMembers", () => {
  it("flags added, removed and unchanged members by iri", () => {
    const result = compareMembers(response(["b", "a", "c"]), response(["c", "d", "a"]));
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.unchanged).toBe(2);
    expect(result.current.map(m => [m.name, m.change])).toEqual([
      ["a", "unchanged"],
      ["b", "removed"],
      ["c", "unchanged"]
    ]);
    expect(result.updated.map(m => [m.name, m.change])).toEqual([
      ["a", "unchanged"],
      ["c", "unchanged"],
      ["d", "added"]
    ]);
  });

  it("handles missing responses", () => {
    expect(compareMembers(undefined, undefined)).toEqual({ current: [], updated: [], added: 0, removed: 0, unchanged: 0 });
    expect(compareMembers(undefined, response(["a"])).added).toBe(1);
    expect(compareMembers(response(["a"]), {}).removed).toBe(1);
  });

  it("ignores duplicate iris", () => {
    const result = compareMembers(response(["a", "a"]), response(["a", "a", "b"]));
    expect(result.current).toHaveLength(1);
    expect(result.updated).toHaveLength(2);
    expect(result.unchanged).toBe(1);
    expect(result.added).toBe(1);
  });

  it("compares inactive members like any other member", () => {
    const result = compareMembers(response(["a", "x"], undefined, ["x"]), response(["a", "x", "y"], undefined, ["x", "y"]));
    expect(result.current.find(m => m.name === "x")?.change).toBe("unchanged");
    expect(result.updated.find(m => m.name === "y")?.change).toBe("added");
    expect(result.removed).toBe(0);
  });
});

describe("isTruncated", () => {
  it("is true only when totalCount exceeds the returned members", () => {
    expect(isTruncated(response(["a", "b"], 5))).toBe(true);
    expect(isTruncated(response(["a", "b"], 2))).toBe(false);
    expect(isTruncated(response(["a", "b"]))).toBe(false);
    expect(isTruncated(undefined)).toBe(false);
  });
});

describe("isInactive", () => {
  it("is true only for a non-active status", () => {
    expect(isInactive({ iri: "http://snomed.info/sct#a", type: [], status: { iri: INACTIVE } })).toBe(true);
    expect(isInactive({ iri: "http://snomed.info/sct#a", type: [], status: { iri: IM.ACTIVE } })).toBe(false);
    expect(isInactive({ iri: "http://snomed.info/sct#a", type: [] })).toBe(false);
  });
});

describe("addMemberToDefinition", () => {
  // Placeholder until the boolean clause creation is implemented
  it("leaves the definition unchanged while not implemented", () => {
    const query: Query = { is: { in: [{ iri: "http://snomed.info/sct#a" }] } } as Query;
    const before = structuredClone(query);
    const member: ComparedMember = { iri: "http://snomed.info/sct#b", name: "b", type: [], change: "removed" };
    addMemberToDefinition(member, query);
    expect(query).toEqual(before);
  });
});
