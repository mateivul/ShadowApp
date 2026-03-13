import type { BuildingNormalized, Point } from "./types";
import { d2r } from "./utils";


function convexHull(points: Point[]): Point[] {
  if (points.length <= 3) return points;

  const center = {
    x: points.reduce((s, p) => s + p.x, 0) / points.length,
    y: points.reduce((s, p) => s + p.y, 0) / points.length,
  };

  return points.sort((a, b) => {
    const aAngle = Math.atan2(a.y - center.y, a.x - center.x);
    const bAngle = Math.atan2(b.y - center.y, b.x - center.x);
    return aAngle - bAngle;
  });
}

export function getBuildingCorners(building: BuildingNormalized): Point[] {
  const x = building.x;
  const y = building.y;
  const w = building.w;
  const d = building.d;

  return [
    { x: x, y: y },
    { x: x + w, y: y },
    { x: x + w, y: y + d },
    { x: x, y: y + d },
  ];
}

export function shadowPoly(
  building: BuildingNormalized,
  azimuthDeg: number,
  altitudeDeg: number,
  maxLength = 120,
): Point[] | null {
  if (altitudeDeg <= 0) return null;

  if (building.angleDeg !== 0) return null;

  const azimuth = d2r(azimuthDeg);
  const length = Math.min(building.roofHeight / Math.tan(d2r(altitudeDeg)), maxLength);
  const vx = -Math.sin(azimuth) * length;
  const vy = -Math.cos(azimuth) * length;

  const corners = getBuildingCorners(building);
  const translated = corners.map((p) => ({ x: p.x + vx, y: p.y + vy }));

  return convexHull([...corners, ...translated]);
}
