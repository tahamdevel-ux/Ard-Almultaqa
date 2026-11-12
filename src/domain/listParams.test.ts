import { describe, expect, it } from "vitest";
import { listQuery, nextSort, parseListParams } from "./listParams";

describe("pilgrims list parameters", () => {
  it("whitelists filter, sort, direction and ids", () => {
    const p = parseListParams({ f: "drop table", sort: "evil", dir: "x", trip: "not-an-id", agent: "11111111-1111-1111-1111-111111111111", q: "a".repeat(300) });
    expect(p).toMatchObject({ f: "", sort: "new", dir: "desc", trip: "", agent: "11111111-1111-1111-1111-111111111111" });
    expect(p.q).toHaveLength(100);
  });
  it("valid values pass; name sorts ascending by default", () => {
    expect(parseListParams({ f: "expiring", sort: "name" })).toMatchObject({ f: "expiring", sort: "name", dir: "asc" });
    expect(parseListParams({ sort: "expiry", dir: "desc" }).dir).toBe("desc");
  });
  it("builds a short query without empty values", () => {
    expect(listQuery({ q: "", f: "noroom", sort: "name", dir: "asc" })).toBe("f=noroom&sort=name&dir=asc");
  });
  it("clicking a column", () => {
    const cur = parseListParams({ sort: "name", dir: "asc" });
    expect(nextSort(cur, "name")).toEqual({ sort: "name", dir: "desc" });
    expect(nextSort(cur, "passport")).toEqual({ sort: "passport", dir: "asc" });
    expect(nextSort(cur, "new")).toEqual({ sort: "new", dir: "desc" });
  });
});
