export const D2R = Math.PI / 180;

export const d2r = (d: number): number => d * D2R;

export const r2d = (r: number): number => (r * 180) / Math.PI;

export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const hhmm = (min: number): string => {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};
