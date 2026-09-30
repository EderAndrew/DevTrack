import { describe, expect, it } from "vitest";
import { splitEvenly } from "../src/index.js";

describe("011 splitEvenly", () => {
  it("dá floor(total / k) a todos e +1 aos primeiros total mod k", () => {
    expect(splitEvenly(10, 3)).toEqual([4, 3, 3]);
    expect(splitEvenly(5, 2)).toEqual([3, 2]);
    expect(splitEvenly(50, 3)).toEqual([17, 17, 16]);
    expect(splitEvenly(6, 3)).toEqual([2, 2, 2]);
  });

  it("é determinístico", () => {
    expect(splitEvenly(97, 7)).toEqual(splitEvenly(97, 7));
  });

  it("k = 0 → []", () => {
    expect(splitEvenly(10, 0)).toEqual([]);
  });
});
