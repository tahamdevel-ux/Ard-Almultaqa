import { describe, expect, it } from "vitest";
import { ageGroup, orderPeople, rowStyles } from "./haya";

const p = (role: "contractor" | "driver" | "assistant" | "pilgrim", n: string) => ({ role, n });
describe("Hay'a rows", () => {
  it("contractor, driver, assistant, then pilgrims in order", () => {
    expect(orderPeople([p("pilgrim", "a"), p("assistant", "x"), p("pilgrim", "b"), p("contractor", "c"), p("driver", "d")]).map((x) => x.n)).toEqual(["c", "d", "x", "a", "b"]);
  });
  it("a missing role lets the next person move up", () => {
    expect(orderPeople([p("pilgrim", "a"), p("driver", "d")]).map((x) => x.n)).toEqual(["d", "a"]);
  });
  it("template style ids", () => {
    expect(rowStyles("contractor")).toEqual([20, 24]);
    expect(rowStyles("driver")).toEqual([21, 25]);
    expect(rowStyles("assistant")).toEqual([21, 25]);
    expect(rowStyles("pilgrim")).toEqual([22, 22]);
    expect(rowStyles(null)).toEqual([22, 22]);
  });
  it("age groups", () => {
    const on = new Date("2026-11-09");
    expect(ageGroup(new Date("2026-01-01"), on)).toBe("infant");
    expect(ageGroup(new Date("2020-01-01"), on)).toBe("child");
    expect(ageGroup(new Date("1980-01-01"), on)).toBe("adult");
    expect(ageGroup(null, on)).toBe("adult");
  });
});
