import { d2r } from "./utils";

export type MarkerPoint = {
  x: number;
  y: number;
  side: "left" | "right" | "top" | "bottom";
};

export function circleMarkerFromAzimuth(azimuthDeg: number, cx: number, cy: number, radius: number): MarkerPoint {
  const az = d2r(azimuthDeg);
  const dx = Math.sin(az);
  const dy = -Math.cos(az);
  const x = cx + dx * radius;
  const y = cy + dy * radius;
  if (Math.abs(dx) > Math.abs(dy)) return { x, y, side: dx >= 0 ? "right" : "left" };
  return { x, y, side: dy >= 0 ? "bottom" : "top" };
}
