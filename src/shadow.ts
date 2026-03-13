import type { BuildingNormalized, Point } from "./types";
import { d2r } from "./utils";


function convexHull(points: Point[]): Point[] {
  if (points.length === 0) return [];
  if (points.length <= 2) return points;

  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);

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
  if (building.w <= 0 || building.d <= 0) {
    console.warn(`Invalid building dimensions: w=${building.w}, d=${building.d}. Using minimum 0.1.`);
  }

  const cx = building.x + building.w / 2;
  const cy = building.y + building.d / 2;
  const angle = d2r(building.angleDeg || 0);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hw = Math.max(0.05, building.w / 2);
  const hd = Math.max(0.05, building.d / 2);
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
  if (altitudeDeg > 89) {
    return null;
  }

  if (!building || building.roofHeight <= 0) {
    return null;
  }

  const azimuth = d2r(azimuthDeg || 0);
  const length = Math.min(building.roofHeight / Math.tan(d2r(altitudeDeg)), maxLength);

  const vx = -Math.sin(azimuth) * length;
  const vy = -Math.cos(azimuth) * length;

  const corners = getBuildingCorners(building);
  const translated = corners.map((p) => ({ x: p.x + vx, y: p.y + vy }));

  const hull = convexHull([...corners, ...translated]);
  return hull.length >= 3 ? hull : null;
}
