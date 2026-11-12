import { describe, expect, it } from "vitest";
import { remainingState, seatsLabel, vacancyLabel } from "./labels";

describe("labels for odd numbers", () => {
  it("capacity 0 asks for a capacity", () => expect(seatsLabel(2, 0)).toEqual({ text: "2 (حدد السعة)", tone: "warn" }));
  it("over capacity says by how many", () => expect(seatsLabel(5, 3)).toMatchObject({ text: "5 من 3 — تجاوز السعة بـ 2", tone: "bad" }));
  it("normal", () => expect(seatsLabel(2, 10)).toEqual({ text: "2 من 10", tone: "ok" }));
  it("vacancy is never negative", () => { expect(vacancyLabel(5, 3)).toBe("0 (ممتلئة)"); expect(vacancyLabel(1, 0)).toBe("—"); expect(vacancyLabel(1, 4)).toBe("3"); });
  it("remaining: owed, settled, extra", () => {
    expect(remainingState(60)).toEqual({ kind: "owed", abs: 60 });
    expect(remainingState(0)).toEqual({ kind: "settled", abs: 0 });
    expect(remainingState(-60)).toEqual({ kind: "extra", abs: 60 });
    expect(remainingState(0.004).kind).toBe("settled");
  });
});
