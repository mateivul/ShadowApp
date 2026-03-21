import { getDayPhaseInfo } from "../day-phase";
import { localToUTC, sunPos } from "../solar";
import { circleMarkerFromAzimuth } from "../sun-markers";
import type { SunriseSunset, SunPosition } from "../types";
import { pathRoundedRect } from "../canvas/shapes";
import { clamp, d2r, hhmm } from "../utils";

type DialArgs = {
  ctx: CanvasRenderingContext2D;
  month: number;
  day: number;
  timeMinutes: number;
  utcOffset: number;
  sun: SunPosition;
  sunriseSunset: SunriseSunset;
  lat: number;
  lng: number;
  ox: number;
  oy: number;
  pw: number;
  ph: number;
  width: number;
  height: number;
};

type MarginArgs = {
  ctx: CanvasRenderingContext2D;
  month: number;
  day: number;
  utcOffset: number;
  sun: SunPosition;
  sunriseSunset: SunriseSunset;
  lat: number;
  lng: number;
  ox: number;
  oy: number;
  pw: number;
  ph: number;
  width: number;
  height: number;
};

export function drawSunCompassDial(args: DialArgs): void {
  const { ctx, month, day, timeMinutes, utcOffset, sun, sunriseSunset, lat, lng, width } = args;

  const sunAlpha = altFactor(sun.altitude, 8, -8);
  const dialR = 25;
  const rightInset = 30;
  const topInset = 28;
  const dialCx = width - dialR - rightInset;
  const dialCy = dialR + topInset;
  const azToTheta = (azimuthDeg: number): number => d2r(azimuthDeg - 90);
  let dayT = 0.5;
  if (sunriseSunset.rise !== null && sunriseSunset.set !== null) {
    const span = Math.max(1, sunriseSunset.set - sunriseSunset.rise);
    dayT = clamp((timeMinutes - sunriseSunset.rise) / span, 0, 1);
  } else {
    dayT = clamp((sun.azimuth - 90) / 180, 0, 1);
  }
  const sunTheta = azToTheta(sun.azimuth);
  const sunX = dialCx + Math.cos(sunTheta) * dialR;
  const sunY = dialCy + Math.sin(sunTheta) * dialR;
  const dayPhase = getDayPhaseInfo(sun, sunriseSunset, timeMinutes, dayT);

  ctx.fillStyle = "rgba(236,243,251,0.94)";
  ctx.beginPath();
  ctx.arc(dialCx, dialCy, dialR - 1.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(47,64,89,0.32)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(dialCx, dialCy, dialR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(58,80,108,0.30)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dialCx, dialCy - dialR + 4);
  ctx.lineTo(dialCx, dialCy + dialR - 4);
  ctx.moveTo(dialCx - dialR + 4, dialCy);
  ctx.lineTo(dialCx + dialR - 4, dialCy);
  ctx.stroke();

  if (sunriseSunset.rise !== null && sunriseSunset.set !== null) {
    const risePos = sunPos(localToUTC(month, day, sunriseSunset.rise, utcOffset), lat, lng);
    const setPos = sunPos(localToUTC(month, day, sunriseSunset.set, utcOffset), lat, lng);
    const startA = azToTheta(risePos.azimuth);
    let endA = azToTheta(setPos.azimuth);
    const anticlockwise = lat < 0;
    if (!anticlockwise) {
      while (endA < startA) endA += Math.PI * 2;
    }
    const sx = dialCx + Math.cos(startA) * dialR;
    const sy = dialCy + Math.sin(startA) * dialR;
    const ex = dialCx + Math.cos(endA) * dialR;
    const ey = dialCy + Math.sin(endA) * dialR;
    const litGradient = ctx.createLinearGradient(sx, sy, ex, ey);
    litGradient.addColorStop(0, "rgba(236,142,61,0.56)");
    litGradient.addColorStop(0.5, "rgba(255,193,89,0.72)");
    litGradient.addColorStop(1, "rgba(236,142,61,0.56)");
    ctx.fillStyle = litGradient;
    ctx.beginPath();
    ctx.moveTo(dialCx, dialCy);
    ctx.arc(dialCx, dialCy, dialR - 1.2, startA, endA, anticlockwise);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = litGradient;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(dialCx, dialCy, dialR, startA, endA, anticlockwise);
    ctx.stroke();

    const centerGlow = ctx.createRadialGradient(dialCx, dialCy, 1, dialCx, dialCy, 8);
    centerGlow.addColorStop(0, "rgba(255,206,112,0.92)");
    centerGlow.addColorStop(1, "rgba(235,142,56,0.88)");
    ctx.fillStyle = centerGlow;
    ctx.beginPath();
    ctx.arc(dialCx, dialCy, 5.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(58,80,108,0.34)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(dialCx, dialCy - dialR + 4);
  ctx.lineTo(dialCx, dialCy + dialR - 4);
  ctx.moveTo(dialCx - dialR + 4, dialCy);
  ctx.lineTo(dialCx + dialR - 4, dialCy);
  ctx.stroke();

  ctx.fillStyle = "rgba(47,66,90,0.86)";
  ctx.font = "10px Space Mono, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", dialCx, dialCy - dialR - 10);
  ctx.fillText("E", dialCx + dialR + 10, dialCy);
  ctx.fillText("S", dialCx, dialCy + dialR + 10);
  ctx.fillText("W", dialCx - dialR - 10, dialCy);

  const glow = ctx.createRadialGradient(sunX, sunY, 1, sunX, sunY, 10);
  const sunVisAlpha = 0.2 + 0.8 * sunAlpha;
  glow.addColorStop(0, `rgba(255,184,77,${(0.96 * sunVisAlpha).toFixed(3)})`);
  glow.addColorStop(0.35, `rgba(255,148,56,${(0.58 * sunVisAlpha).toFixed(3)})`);
  glow.addColorStop(1, "rgba(255,128,40,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = `rgba(255,161,62,${(0.95 * sunVisAlpha).toFixed(3)})`;
  ctx.beginPath();
  ctx.arc(sunX, sunY, 3.9, 0, Math.PI * 2);
  ctx.fill();

  const dayPartText = `${dayPhase.emoji}${dayPhase.label}`;
  ctx.font =
    '10.5px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", "Space Mono", monospace';
  const labelWidth = ctx.measureText(dayPartText).width;
  const pillW = labelWidth + 16;
  const pillH = 20;
  const pillRadius = 10;
  const pillX = 10;
  const pillY = 10;
  const pillCenterX = pillX + pillW / 2;
  ctx.fillStyle = dayPhase.pillBg;
  pathRoundedRect(ctx, pillX, pillY, pillW, pillH, pillRadius);
  ctx.fill();
  ctx.fillStyle = dayPhase.pillText;
  ctx.textBaseline = "middle";
  ctx.fillText(dayPartText, pillCenterX, pillY + pillH / 2 + 0.5);
}

export function drawCircularSunMarginMarkers(args: MarginArgs): void {
  const { ctx, month, day, utcOffset, sun, sunriseSunset, lat, lng, ox, oy, pw, ph, width, height } = args;
  if (sunriseSunset.rise === null || sunriseSunset.set === null) return;

  const ringCx = ox + pw / 2;
  const ringCy = oy + ph / 2;
  const isSmallViewport = width <= 760;
  const targetRingR = Math.hypot(pw, ph) * 0.5 + 2;

  const safeInsetX = isSmallViewport ? Math.max(24, width * 0.05) : Math.max(28, width * 0.06);
  const safeInsetY = isSmallViewport ? Math.max(18, height * 0.02) : Math.max(18, height * 0.04);
  const verticalCapR = height * 0.5;
  const horizontalCapR = width * 0.5;
  const maxOnScreenR = Math.max(
    0,
    Math.min(ringCx - safeInsetX, width - ringCx - safeInsetX, ringCy - safeInsetY, height - ringCy - safeInsetY),
  );

  const desiredR = isSmallViewport ? maxOnScreenR * 0.96 : targetRingR;
  const ringR = Math.min(desiredR, maxOnScreenR, verticalCapR, horizontalCapR);

  ctx.strokeStyle = "rgba(86,110,135,0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(ringCx, ringCy, ringR, 0, Math.PI * 2);
  ctx.stroke();

  const risePos = sunPos(localToUTC(month, day, sunriseSunset.rise + 2, utcOffset), lat, lng);
  const setPos = sunPos(localToUTC(month, day, sunriseSunset.set - 2, utcOffset), lat, lng);
  const riseMarker = circleMarkerFromAzimuth(risePos.azimuth, ringCx, ringCy, ringR);
  const setMarker = circleMarkerFromAzimuth(setPos.azimuth, ringCx, ringCy, ringR);
  const currentSunMarker = circleMarkerFromAzimuth(sun.azimuth, ringCx, ringCy, ringR);

  drawLabeledMarker(ctx, riseMarker, "rgba(30,160,70,0.92)", "Rise", hhmm(sunriseSunset.rise), width);
  drawLabeledMarker(ctx, setMarker, "rgba(210,95,25,0.95)", "Set", hhmm(sunriseSunset.set), width);

  const marginSunGlow = ctx.createRadialGradient(
    currentSunMarker.x,
    currentSunMarker.y,
    1,
    currentSunMarker.x,
    currentSunMarker.y,
    13.2,
  );
  marginSunGlow.addColorStop(0, "rgba(255,188,84,1)");
  marginSunGlow.addColorStop(0.35, "rgba(255,151,58,0.86)");
  marginSunGlow.addColorStop(1, "rgba(255,128,40,0)");
  ctx.fillStyle = marginSunGlow;
  ctx.beginPath();
  ctx.arc(currentSunMarker.x, currentSunMarker.y, 13.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,164,63,1)";
  ctx.beginPath();
  ctx.arc(currentSunMarker.x, currentSunMarker.y, 5.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawLabeledMarker(
  ctx: CanvasRenderingContext2D,
  marker: { x: number; y: number; side: "left" | "right" | "top" | "bottom" },
  color: string,
  label: string,
  time: string,
  canvasWidth: number,
): void {
  const isSmallCanvas = canvasWidth <= 760;
  let lx = marker.x;
  let ly = marker.y;
  if (isSmallCanvas) {
    if (marker.side === "left") {
      lx += 10;
      ctx.textAlign = "left";
    } else if (marker.side === "right") {
      lx -= 10;
      ctx.textAlign = "right";
    } else {
      ctx.textAlign = "center";
    }
    if (marker.side === "top") ly += 12;
    if (marker.side === "bottom") ly -= 8;
  } else {
    if (marker.side === "left") {
      lx -= 8;
      ctx.textAlign = "right";
    } else if (marker.side === "right") {
      lx += 8;
      ctx.textAlign = "left";
    } else {
      ctx.textAlign = "center";
    }
    if (marker.side === "top") ly -= 7;
    if (marker.side === "bottom") ly += 14;
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(marker.x, marker.y, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = "11px Space Mono, monospace";
  ctx.textBaseline = "alphabetic";
  if (isSmallCanvas) {
    const firstLineY = ly - 1;
    const secondLineY = ly + 10;
    ctx.fillText(label, lx, firstLineY);
    ctx.fillText(time, lx, secondLineY);
    return;
  }

  ctx.textBaseline = "middle";
  ctx.fillText(`${label} ${time}`, lx, ly);
}

function altFactor(altitude: number, fullAt: number, zeroAt: number): number {
  return clamp((altitude - zeroAt) / (fullAt - zeroAt), 0, 1);
}
