import { describe, it, expect } from "vitest";
import { clusterOrder } from "./clusterOrder";

const it_ = (id: string, groupIds: string[] = [], roomId: string | null = null, head = false) => ({ id, groupIds, roomId, head });
const ids = (a: { id: string }[]) => a.map((x) => x.id).join("");

describe("clusterOrder", () => {
  const info = (x: ReturnType<typeof it_>) => x;
  it("family members sit together, head first, clusters keep the order of their first member", () => {
    const list = [it_("a", ["F"]), it_("b"), it_("c", ["F"], null, true), it_("d"), it_("e", ["F"])];
    expect(ids(clusterOrder(list, info))).toBe("caebd");
  });
  it("room-mates are together too, and a family in a room pulls the whole room along", () => {
    const list = [it_("a", [], "R1"), it_("b"), it_("c", ["F"], "R1"), it_("d", ["F"], "R2"), it_("e", [], "R2")];
    expect(ids(clusterOrder(list, info))).toBe("acdeb");
  });
  it("nothing linked keeps the original order", () => {
    const list = [it_("x"), it_("y"), it_("z")];
    expect(ids(clusterOrder(list, info))).toBe("xyz");
  });
});
