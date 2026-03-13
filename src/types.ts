export type Point = {
  x: number;
  y: number;
};

export type BuildingInput = {
  kind?: "building" | "wall";
  id?: string;
  label?: string;
  x: number;
  y: number;
  width?: number;
  depth?: number;
  w?: number;
  d?: number;
  angleDeg?: number;
  roofHeight?: number;
  height?: number;
  color?: string;
};

export type BuildingNormalized = {
  kind: "building" | "wall";
  id?: string;
  label?: string;
  x: number;
  y: number;
  w: number;
  d: number;
  angleDeg: number;
  roofHeight: number;
  color?: string;
};

export type UnitSystem = "m" | "ft";

export type LocationConfig = {
  name?: string;
  lat: number;
  lng: number;
  utcOffset?: number;
  timeZone?: string;
};

export type PlotConfig = {
  width: number;
  depth: number;
};

export type AppConfig = {
  units?: UnitSystem;
  location: LocationConfig;
  plot: PlotConfig;
  buildings: BuildingInput[];
};

export type SunPosition = {
  azimuth: number;
  altitude: number;
};

export type SunriseSunset = {
  rise: number | null;
  set: number | null;
};
