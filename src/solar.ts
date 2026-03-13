import type { SunPosition, SunriseSunset } from "./types";
import { clamp, d2r, r2d } from "./utils";


function calculateDeclination(T: number): number {
  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const Mr = d2r(M);
  const C =
    Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mr) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(d2r(omega));
  const eps =
    23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(d2r(omega));
  const sinDec = Math.sin(d2r(eps)) * Math.sin(d2r(lambda));
  return Math.asin(clamp(sinDec, -1, 1));
}

function calculateAtmosphericRefraction(altitude: number): number {
  if (altitude < -1) return 0;
  return d2r(0.2665 / Math.tan(d2r(altitude + 7.31 / (altitude + 4.4))));
}

export function sunPos(utcDate: Date, lat: number, lng: number): SunPosition {
  const JD = utcDate.getTime() / 86400000 + 2440587.5;
  const T = (JD - 2451545) / 36525;

  const dec = calculateDeclination(T);

  const L0 = (((280.46646 + T * (36000.76983 + T * 0.0003032)) % 360) + 360) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const Mr = d2r(M);
  const C =
    Math.sin(Mr) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mr) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mr) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(d2r(omega));
  const eps =
    23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(d2r(omega));
  const RA = Math.atan2(Math.cos(d2r(eps)) * Math.sin(d2r(lambda)), Math.cos(d2r(lambda)));
  const GST =
    (((280.46061837 + 360.98564736629 * (JD - 2451545) + T * T * (0.000387933 - T / 38710000)) % 360) + 360) % 360;
  const LHA = d2r((((GST + lng - r2d(RA)) % 360) + 360) % 360);

  const latR = d2r(lat);
  const sinAlt = Math.sin(latR) * Math.sin(dec) + Math.cos(latR) * Math.cos(dec) * Math.cos(LHA);
  let altitude = r2d(Math.asin(clamp(sinAlt, -1, 1)));

  const refraction = calculateAtmosphericRefraction(altitude);
  altitude += r2d(refraction);

  const cosAz = (Math.sin(dec) - Math.sin(latR) * sinAlt) / (Math.cos(latR) * Math.cos(d2r(altitude - r2d(refraction))));
  let azimuth = r2d(Math.acos(clamp(cosAz, -1, 1)));
  if (Math.sin(LHA) > 0) azimuth = 360 - azimuth;

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
