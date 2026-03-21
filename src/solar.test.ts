import { describe, it, expect, beforeEach } from "vitest";
import { sunPos, localToUTC, getSunriseSunset, clearSunriseSunsetCache } from "./solar";

const LONDON_LAT = 51.5074;
const LONDON_LNG = -0.1278;

describe("localToUTC", () => {
  it("noon UTC+0 returns date with hour 12", () => {
    const d = localToUTC(6, 21, 720, 0, 2024);
    expect(d.getUTCHours()).toBe(12);
    expect(d.getUTCMinutes()).toBe(0);
  });

  it("noon UTC+2 returns hour 10 in UTC", () => {
    const d = localToUTC(6, 21, 720, 2, 2024);
    expect(d.getUTCHours()).toBe(10);
  });

  it("noon UTC-5 returns hour 17 in UTC", () => {
    const d = localToUTC(6, 21, 720, -5, 2024);
    expect(d.getUTCHours()).toBe(17);
  });

  it("uses the provided year", () => {
    const d = localToUTC(1, 1, 0, 0, 2020);
    expect(d.getUTCFullYear()).toBe(2020);
    expect(d.getUTCMonth()).toBe(0);
    expect(d.getUTCDate()).toBe(1);
  });

  it("midnight (0 min) at UTC+0 returns 00:00", () => {
    const d = localToUTC(6, 21, 0, 0, 2024);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
  });
});

describe("sunPos", () => {
  it("summer solstice noon London: altitude is roughly 62°", () => {
    // Solar noon in London on June 21 ≈ 13:00 BST (12:00 UTC+1)
    const d = localToUTC(6, 21, 720, 1, 2024); // local noon BST
    const pos = sunPos(d, LONDON_LAT, LONDON_LNG);
    expect(pos.altitude).toBeGreaterThan(55);
    expect(pos.altitude).toBeLessThan(70);
  });

  it("winter solstice noon London: altitude is roughly 15°", () => {
    const d = localToUTC(12, 21, 720, 0, 2024);
    const pos = sunPos(d, LONDON_LAT, LONDON_LNG);
    expect(pos.altitude).toBeGreaterThan(8);
    expect(pos.altitude).toBeLessThan(22);
  });

  it("midnight London: sun is below horizon", () => {
    const d = localToUTC(6, 21, 0, 0, 2024);
    const pos = sunPos(d, LONDON_LAT, LONDON_LNG);
    expect(pos.altitude).toBeLessThan(0);
  });

  it("azimuth is south-ish at noon in northern hemisphere", () => {
    const d = localToUTC(6, 21, 720, 1, 2024);
    const pos = sunPos(d, LONDON_LAT, LONDON_LNG);
    // Azimuth 180° = due south; tolerate ±30° around solar noon
    expect(pos.azimuth).toBeGreaterThan(140);
    expect(pos.azimuth).toBeLessThan(220);
  });

  it("azimuth is 0–360", () => {
    const d = localToUTC(6, 21, 840, 0, 2024);
    const { azimuth } = sunPos(d, 45, 10);
    expect(azimuth).toBeGreaterThanOrEqual(0);
    expect(azimuth).toBeLessThanOrEqual(360);
  });

  it("altitude is −90 to +90", () => {
    const d = localToUTC(6, 21, 720, 0, 2024);
    const { altitude } = sunPos(d, 45, 10);
    expect(altitude).toBeGreaterThanOrEqual(-90);
    expect(altitude).toBeLessThanOrEqual(90);
  });
});

describe("getSunriseSunset", () => {
  beforeEach(() => clearSunriseSunsetCache());

  it("London summer: both rise and set exist", () => {
    const { rise, set } = getSunriseSunset(6, 21, LONDON_LAT, LONDON_LNG, 1);
    expect(rise).not.toBeNull();
    expect(set).not.toBeNull();
  });

  it("London summer: sunrise is before noon", () => {
    const { rise } = getSunriseSunset(6, 21, LONDON_LAT, LONDON_LNG, 1);
    expect(rise!).toBeLessThan(720);
  });

  it("London summer: sunset is after noon", () => {
    const { set } = getSunriseSunset(6, 21, LONDON_LAT, LONDON_LNG, 1);
    expect(set!).toBeGreaterThan(720);
  });

  it("London winter: both rise and set exist", () => {
    const { rise, set } = getSunriseSunset(12, 21, LONDON_LAT, LONDON_LNG, 0);
    expect(rise).not.toBeNull();
    expect(set).not.toBeNull();
  });

  it("London winter: shorter day (sunset earlier than summer)", () => {
    const summer = getSunriseSunset(6, 21, LONDON_LAT, LONDON_LNG, 1);
    const winter = getSunriseSunset(12, 21, LONDON_LAT, LONDON_LNG, 0);
    const summerDayLen = summer.set! - summer.rise!;
    const winterDayLen = winter.set! - winter.rise!;
    expect(summerDayLen).toBeGreaterThan(winterDayLen);
  });

  it("caches results (same object reference)", () => {
    const a = getSunriseSunset(6, 21, LONDON_LAT, LONDON_LNG, 1);
    const b = getSunriseSunset(6, 21, LONDON_LAT, LONDON_LNG, 1);
    expect(a).toBe(b);
  });

  it("cache is cleared by clearSunriseSunsetCache", () => {
    const a = getSunriseSunset(6, 21, LONDON_LAT, LONDON_LNG, 1);
    clearSunriseSunsetCache();
    const b = getSunriseSunset(6, 21, LONDON_LAT, LONDON_LNG, 1);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});
