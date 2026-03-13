import type { SunPosition, SunriseSunset } from "./types";
import { clamp, d2r, r2d } from "./utils";


export function sunPos(utcDate: Date, lat: number, lng: number): SunPosition {
  const JD = utcDate.getTime() / 86400000 + 2440587.5;
  const T = (JD - 2451545) / 36525;

  const n = JD - 2451545;
  const dec = d2r(23.44 * Math.sin(d2r((360 / 365.25) * (n + 10))));

  const LST = ((280.46061837 + 360.98564736629 * (JD - 2451545)) % 360 + lng) / 15;
  const HA = d2r(15 * (LST - 12));

  const latR = d2r(lat);
  const sinAlt = Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(HA);
  const altitude = r2d(Math.asin(clamp(sinAlt, -1, 1)));

  let azimuth = r2d(Math.atan2(Math.sin(HA), Math.cos(HA) * Math.sin(latR) - Math.tan(dec) * Math.cos(latR)));
  azimuth = (azimuth + 360) % 360;

  return { azimuth, altitude };
}

export function localToUTC(
  month: number,
  day: number,
  localMin: number,
  utcOffset: number,
  year = new Date().getFullYear(),
): Date {
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0) + (localMin - utcOffset * 60) * 60000);
}

const srCache: Record<string, SunriseSunset> = {};

export function clearSunriseSunsetCache(): void {
  Object.keys(srCache).forEach((key) => delete srCache[key]);
}

export function getSunriseSunset(
  month: number,
  day: number,
  lat: number,
  lng: number,
  utcOffset: number,
): SunriseSunset {
  const cacheKey = `${month}-${day}-${lat}-${lng}-${utcOffset}`;
  if (srCache[cacheKey]) return srCache[cacheKey];

  let prev: boolean = sunPos(localToUTC(month, day, 0, utcOffset), lat, lng).altitude > 0;
  let rise: number | null = null;
  let set: number | null = null;

  for (let m = 5; m < 1440; m += 5) {
    const above = sunPos(localToUTC(month, day, m, utcOffset), lat, lng).altitude > 0;
    if (!prev && above && rise === null) rise = m;
    if (prev && !above && set === null) set = m;
    prev = above;
  }

  const value = { rise, set };
  srCache[cacheKey] = value;
  return value;
}
