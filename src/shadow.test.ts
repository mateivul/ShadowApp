import { describe, it, expect } from "vitest";
import { getBuildingCorners, shadowPoly } from "./shadow";
import type { BuildingNormalized } from "./types";

function makeBuilding(overrides: Partial<BuildingNormalized> = {}): BuildingNormalized {
  return {
    kind: "building",
    x: 0,
    y: 0,
    w: 10,
    d: 5,
    angleDeg: 0,
    roofHeight: 4,
    color: "#fff",
    ...overrides,
  };
}

describe("getBuildingCorners", () => {
  it("returns 4 corners for a rectangle", () => {
    const corners = getBuildingCorners(makeBuilding());
    expect(corners).toHaveLength(4);
  });

  it("unrotated: corners span the correct bounding box", () => {
    const b = makeBuilding({ x: 2, y: 3, w: 6, d: 4, angleDeg: 0 });
    const corners = getBuildingCorners(b);
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    expect(Math.min(...xs)).toBeCloseTo(2);
    expect(Math.max(...xs)).toBeCloseTo(8);
    expect(Math.min(...ys)).toBeCloseTo(3);
    expect(Math.max(...ys)).toBeCloseTo(7);
  });

  it("90° rotation: width and depth swap in bounding box", () => {
    const b = makeBuilding({ x: 0, y: 0, w: 10, d: 4, angleDeg: 90 });
    const corners = getBuildingCorners(b);
    const xs = corners.map((c) => c.x);
    const ys = corners.map((c) => c.y);
    const bboxW = Math.max(...xs) - Math.min(...xs);
    const bboxH = Math.max(...ys) - Math.min(...ys);
    expect(bboxW).toBeCloseTo(4, 0);
    expect(bboxH).toBeCloseTo(10, 0);
  });

  it("center of corners equals building center", () => {
    const b = makeBuilding({ x: 4, y: 6, w: 8, d: 4, angleDeg: 37 });
    const corners = getBuildingCorners(b);
    const cx = corners.reduce((s, p) => s + p.x, 0) / 4;
    const cy = corners.reduce((s, p) => s + p.y, 0) / 4;
    expect(cx).toBeCloseTo(b.x + b.w / 2);
    expect(cy).toBeCloseTo(b.y + b.d / 2);
  });
});

describe("shadowPoly", () => {
  it("returns null when altitude <= 0", () => {
    expect(shadowPoly(makeBuilding(), 180, 0)).toBeNull();
    expect(shadowPoly(makeBuilding(), 180, -10)).toBeNull();
  });

  it("returns a polygon with at least 4 points when altitude > 0", () => {
    const poly = shadowPoly(makeBuilding(), 180, 45);
    expect(poly).not.toBeNull();
    expect(poly!.length).toBeGreaterThanOrEqual(4);
  });

  it("shadow is longer at lower sun altitude", () => {
    const b = makeBuilding({ roofHeight: 5 });
    const highSun = shadowPoly(b, 180, 60)!;
    const lowSun = shadowPoly(b, 180, 10)!;

    const polyLength = (poly: { x: number; y: number }[]) => {
      const xs = poly.map((p) => p.x);
      const ys = poly.map((p) => p.y);
      return Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    };

    expect(polyLength(lowSun)).toBeGreaterThan(polyLength(highSun));
  });

  it("shadow respects maxLength cap", () => {
    const b = makeBuilding({ roofHeight: 100 });
    const poly = shadowPoly(b, 180, 1, 20)!; // very low sun, short cap
    const ys = poly.map((p) => p.y);
    const extent = Math.abs(Math.min(...ys) - Math.max(...ys));
    expect(extent).toBeLessThanOrEqual(30); // rough check, cap is 20m
  });

  it("sun from south (az=180): shadow offset goes in +Y direction (northward in plot coords)", () => {
    // azimuth 180° = sun due south → vy = -cos(π)*L = +L → shadow extends in +Y
    const b = makeBuilding({ x: 0, y: 0, w: 4, d: 4, roofHeight: 4 });
    const poly = shadowPoly(b, 180, 45)!;
    const maxY = Math.max(...poly.map((p) => p.y));
    // shadow translated points should go beyond the building top edge (y=4)
    expect(maxY).toBeGreaterThan(4);
  });

  it("convex hull: result has fewer or equal points than 2×corners", () => {
    const poly = shadowPoly(makeBuilding(), 225, 30)!;
    expect(poly.length).toBeLessThanOrEqual(8);
  });
});
