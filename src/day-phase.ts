import type { SunriseSunset, SunPosition } from "./types";

export type DayPhaseLabel = "Morning" | "Day" | "Evening" | "Night";

export type DayPhaseInfo = {
  label: DayPhaseLabel;
  emoji: string;
  pillBg: string;
  pillText: string;
};

const PILL_BG: Record<DayPhaseLabel, string> = {
  Morning: "rgba(255,214,154,0.92)",
  Day: "rgba(255,236,168,0.94)",
  Evening: "rgba(255,198,150,0.93)",
  Night: "rgba(150,168,205,0.9)",
};

const PILL_TEXT: Record<DayPhaseLabel, string> = {
  Morning: "rgba(118,72,29,0.96)",
  Day: "rgba(116,83,22,0.97)",
  Evening: "rgba(128,64,28,0.97)",
  Night: "rgba(34,52,82,0.98)",
};

export function getDayPhaseInfo(
  sun: SunPosition,
  sunriseSunset: SunriseSunset,
  timeMinutes: number,
  dayProgress: number,
): DayPhaseInfo {
  let label: DayPhaseLabel = "Night";
  let emoji = "🌙";

  if (sunriseSunset.rise !== null && sunriseSunset.set !== null) {
    if (timeMinutes >= sunriseSunset.rise && timeMinutes <= sunriseSunset.set) {
      if (dayProgress < 0.3) {
        label = "Morning";
        emoji = "🌅";
      } else if (dayProgress > 0.7) {
        label = "Evening";
        emoji = "🌇";
      } else {
        label = "Day";
        emoji = "☀️";
      }
    }
  } else if (sun.altitude > 35) {
    label = "Day";
    emoji = "☀️";
  } else if (sun.altitude > 6) {
    if (sun.azimuth < 180) {
      label = "Morning";
      emoji = "🌅";
    } else {
      label = "Evening";
      emoji = "🌇";
    }
  }

  return {
    label,
    emoji,
    pillBg: PILL_BG[label],
    pillText: PILL_TEXT[label],
  };
}
