import type { BuildingNormalized, Point } from "./types";
import { d2r } from "./utils";


function convexHull(points: Point[]): Point[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (sorted.length <= 1) return sorted;

  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  const upper: Point[] = [];

  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

export function getBuildingCorners(building: BuildingNormalized): Point[] {
  const cx = building.x + building.w / 2;
  const cy = building.y + building.d / 2;
  const angle = d2r(building.angleDeg);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hw = building.w / 2;
  const hd = building.d / 2;
  const localCorners: Point[] = [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ];

  return localCorners.map((p) => ({
    x: cx + p.x * cos - p.y * sin,
    y: cy + p.x * sin + p.y * cos,
  }));
}

export function shadowPoly(
  building: BuildingNormalized,
  azimuthDeg: number,
  altitudeDeg: number,
  maxLength = 120,
): Point[] | null {
  if (altitudeDeg <= 0) return null;
  if (Math.abs(altitudeDeg) > 89) return null;

  const azimuth = d2r(azimuthDeg);
  const length = Math.min(building.roofHeight / Math.tan(d2r(altitudeDeg)), maxLength);

  const vx = -Math.sin(azimuth) * length;
  const vy = -Math.cos(azimuth) * length;

  const corners = getBuildingCorners(building);
  const translated = corners.map((p) => ({ x: p.x + vx, y: p.y + vy }));

  return convexHull([...corners, ...translated]);
}
