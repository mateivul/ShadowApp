import { describe, it, expect } from "vitest";
import { d2r, r2d, clamp, hhmm, D2R } from "./utils";

describe("D2R constant", () => {
  it("equals Math.PI / 180", () => {
    expect(D2R).toBeCloseTo(Math.PI / 180);
  });
});

describe("d2r", () => {
  it("converts 0° to 0 rad", () => expect(d2r(0)).toBe(0));
  it("converts 180° to π", () => expect(d2r(180)).toBeCloseTo(Math.PI));
  it("converts 90° to π/2", () => expect(d2r(90)).toBeCloseTo(Math.PI / 2));
  it("converts 360° to 2π", () => expect(d2r(360)).toBeCloseTo(2 * Math.PI));
  it("converts negative degrees", () => expect(d2r(-90)).toBeCloseTo(-Math.PI / 2));
});

describe("r2d", () => {
  it("converts 0 rad to 0°", () => expect(r2d(0)).toBe(0));
  it("converts π to 180°", () => expect(r2d(Math.PI)).toBeCloseTo(180));
  it("converts π/2 to 90°", () => expect(r2d(Math.PI / 2)).toBeCloseTo(90));
  it("converts 2π to 360°", () => expect(r2d(2 * Math.PI)).toBeCloseTo(360));
  it("is inverse of d2r", () => expect(r2d(d2r(45))).toBeCloseTo(45));
});

describe("clamp", () => {
  it("returns value when within range", () => expect(clamp(5, 0, 10)).toBe(5));
  it("clamps to lower bound", () => expect(clamp(-1, 0, 10)).toBe(0));
  it("clamps to upper bound", () => expect(clamp(15, 0, 10)).toBe(10));
  it("returns lo when value equals lo", () => expect(clamp(0, 0, 10)).toBe(0));
  it("returns hi when value equals hi", () => expect(clamp(10, 0, 10)).toBe(10));
  it("works with negative ranges", () => expect(clamp(-5, -10, -1)).toBe(-5));
  it("clamps below negative range", () => expect(clamp(-15, -10, -1)).toBe(-10));
});

describe("hhmm", () => {
  it("formats midnight", () => expect(hhmm(0)).toBe("00:00"));
  it("formats noon", () => expect(hhmm(720)).toBe("12:00"));
  it("formats one hour", () => expect(hhmm(60)).toBe("01:00"));
  it("formats last minute of day", () => expect(hhmm(1439)).toBe("23:59"));
  it("wraps at 1440 back to 00:00", () => expect(hhmm(1440)).toBe("00:00"));
  it("pads single-digit hours", () => expect(hhmm(30)).toBe("00:30"));
  it("pads single-digit minutes", () => expect(hhmm(61)).toBe("01:01"));
});
