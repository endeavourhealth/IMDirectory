import { describe, expect, it } from "vitest";
import { Entail } from "@endeavour/vue-library/enums";
import { type Node, type Query } from "@endeavour/vue-library/models";
import { addConceptToIs, normaliseIs, removeConceptFromIs, updateFocusConcepts } from "@/helpers/buildQuery";

const A = { iri: "http://snomed.info/sct#1", name: "A" };
const B = { iri: "http://snomed.info/sct#2", name: "B" };
const C = { iri: "http://snomed.info/sct#3", name: "C" };

describe("buildQuery - Query.is / Query.is.in", () => {
  describe("addConceptToIs", () => {
    it("sets iri and name when the node has no concept", () => {
      const node: Node = { entails: Entail.descendantsOrSelfOf };
      addConceptToIs(node, A);
      expect(node).toEqual({ entails: Entail.descendantsOrSelfOf, ...A });
    });

    it("moves all concepts into the in list when a second is added", () => {
      const node: Node = { entails: Entail.descendantsOrSelfOf, ...A };
      addConceptToIs(node, B);
      expect(node).toEqual({ entails: Entail.descendantsOrSelfOf, in: [A, B] });
      expect(node.iri).toBeUndefined();
      expect(node.name).toBeUndefined();
    });

    it("appends to an existing in list", () => {
      const node: Node = { in: [{ ...A }, { ...B }] };
      addConceptToIs(node, C);
      expect(node.in).toEqual([A, B, C]);
    });

    it("ignores duplicates and concepts without an iri", () => {
      const single: Node = { ...A };
      addConceptToIs(single, A);
      expect(single).toEqual(A);

      const list: Node = { in: [{ ...A }, { ...B }] };
      addConceptToIs(list, B);
      addConceptToIs(list, { name: "no iri" });
      expect(list.in).toEqual([A, B]);
    });

    it("only stores iri and name in the in list", () => {
      const node: Node = { entails: Entail.descendantsOf, ...A };
      addConceptToIs(node, { ...B, entails: Entail.descendantsOf } as Node);
      expect(node.in).toEqual([A, B]);
    });
  });

  describe("removeConceptFromIs", () => {
    it("removes an entry and keeps the list when two or more remain", () => {
      const node: Node = { in: [{ ...A }, { ...B }, { ...C }] };
      removeConceptFromIs(node, 1);
      expect(node).toEqual({ in: [A, C] });
    });

    it("moves the last remaining concept back to iri and name", () => {
      const node: Node = { entails: Entail.descendantsOrSelfOf, in: [{ ...A }, { ...B }] };
      removeConceptFromIs(node, 1);
      expect(node).toEqual({ entails: Entail.descendantsOrSelfOf, ...A });
      expect(node.in).toBeUndefined();
    });

    it("ignores an out of range index", () => {
      const node: Node = { in: [{ ...A }, { ...B }] };
      removeConceptFromIs(node, 5);
      expect(node.in).toEqual([A, B]);
    });
  });

  describe("normaliseIs", () => {
    it("collapses a single entry in list", () => {
      const node: Node = { in: [{ ...A }] };
      normaliseIs(node);
      expect(node).toEqual(A);
    });

    it("removes an empty in list", () => {
      const node: Node = { in: [] };
      normaliseIs(node);
      expect(node).toEqual({});
    });

    it("merges iri into the in list when both are present", () => {
      const node: Node = { ...A, in: [{ ...B }, { ...C }] };
      normaliseIs(node);
      expect(node).toEqual({ in: [A, B, C] });
    });
  });

  describe("updateFocusConcepts", () => {
    it("returns the iris of the in list", () => {
      const match: Query = { is: { in: [{ ...A }, { ...B }] } };
      expect(updateFocusConcepts(match)).toEqual([A.iri, B.iri]);
    });

    it("returns the single iri", () => {
      const match: Query = { is: { ...A } };
      expect(updateFocusConcepts(match)).toEqual([A.iri]);
    });
  });
});
