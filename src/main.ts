import { clearSunriseSunsetCache, getSunriseSunset, localToUTC, sunPos } from "./solar";
import { getBuildingCorners, shadowPoly } from "./shadow";
import { drawCircularSunMarginMarkers, drawSunCompassDial } from "./render/sun-ui";
import { LocationLookupController, type LocationItem } from "./location-lookup";
import type { AppConfig, BuildingNormalized, Point, UiMode, UnitSystem } from "./types";
import { clamp, d2r, hhmm, r2d } from "./utils";
import { ThreeView } from "./render/three-view";
import "leaflet/dist/leaflet.css";
import {
  AUTOSAVE_DELAY_MS,
  SHADOW_FADE_ALT_END,
  SHADOW_FADE_ALT_START,
  STORAGE_KEY,
  UI_PREFS_KEY,
  TEMP_COOL_FULL_ALT,
  TEMP_COOL_ZERO_ALT,
  TEMP_NIGHT_FULL_ALT,
  TEMP_NIGHT_ZERO_ALT,
  TEMP_WARM_CENTER_ALT,
  TEMP_WARM_HALFSPAN,
  TRACE,
  TRACE_SHADOW_MIN_ALT,
  VIS_DAY_FULL_ALT,
  VIS_DAY_ZERO_ALT,
  WALL_THICKNESS,
} from "./constants";

const DEFAULT: AppConfig = {
  units: "m",
  location: { name: "London, United Kingdom", lat: 51.5074, lng: -0.1278, utcOffset: 0 },
  plot: { width: 40, depth: 50 },
  buildings: [
    {
      kind: "building",
      id: "house",
      label: "Main House",
      x: 5,
      y: 8,
      width: 14,
      depth: 10,
      roofHeight: 8,
      color: "#f8fbff",
    },
    {
      kind: "building",
      id: "garage",
      label: "Garage",
      x: 5,
      y: 22,
      width: 7,
      depth: 6,
      roofHeight: 3.5,
      color: "#eaf2ff",
    },
    { kind: "building", id: "shed", label: "Shed", x: 28, y: 8, width: 5, depth: 4, roofHeight: 2.5, color: "#f6efe7" },
    {
      kind: "wall",
      id: "garden-wall",
      label: "Garden Wall",
      x: 5,
      y: 38,
      width: 30,
      depth: 0.25,
      roofHeight: 2,
      color: "#c8bfb5",
      angleDeg: 0,
    },
  ],
  guideItems: [],
};
const FEET_PER_METER = 3.280839895;
const DEFAULT_MAP_PICKER_ZOOM = 17;

const getById = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Element not found: ${id}`);
  return element as T;
};

const canvas = getById<HTMLCanvasElement>("c");
const maybeCtx = canvas.getContext("2d");
if (!maybeCtx) throw new Error("Canvas 2D context is not available");
const ctx: CanvasRenderingContext2D = maybeCtx;

const maybeMainEl = document.querySelector<HTMLElement>("main");
if (!maybeMainEl) throw new Error("<main> element not found");
const mainEl: HTMLElement = maybeMainEl;

const seasonButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-month]"));
const slider = getById<HTMLInputElement>("tslider");
const timeInput = getById<HTMLInputElement>("ttime");
const timePlayButton = getById<HTMLButtonElement>("time-play");
const traceCheckbox = getById<HTMLInputElement>("trace");
const viewHeightWrap = getById<HTMLLabelElement>("view-height-wrap");
const viewHeightSelect = getById<HTMLSelectElement>("view-height");
const modeButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-mode]"));
const toolButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-tool]"));

const iAz = getById<HTMLElement>("iaz");
const iAlt = getById<HTMLElement>("ialt");
const iRise = getById<HTMLElement>("irise");
const iSet = getById<HTMLElement>("iset");
const locTagMobile = getById<HTMLElement>("loc-tag-mobile");
const locTag = getById<HTMLElement>("loc-tag");

const sDay = getById<HTMLElement>("s-day");
const sRise = getById<HTMLElement>("s-rise");
const sSet = getById<HTMLElement>("s-set");
const sRiseLabel = getById<HTMLElement>("s-rise-lbl");
const sSetLabel = getById<HTMLElement>("s-set-lbl");
const sThumb = getById<HTMLElement>("s-thumb");

const cfgPanel = getById<HTMLElement>("cfg-panel");
const overlay = getById<HTMLElement>("overlay");
const cfgTextArea = getById<HTMLTextAreaElement>("cfg");
const cfgErr = getById<HTMLElement>("cerr");
const cfgNewButton = getById<HTMLButtonElement>("cfg-new");
const cfgDuplicateButton = getById<HTMLButtonElement>("cfg-duplicate");
const cfgProjectList = getById<HTMLElement>("cfg-project-list");
const cfgDownloadButton = getById<HTMLButtonElement>("cfg-download");
const cfgUploadButton = getById<HTMLButtonElement>("cfg-upload");
const cfgUploadInput = getById<HTMLInputElement>("cfg-upload-input");
const cfgShareButton = getById<HTMLButtonElement>("cfg-share");
const cfgResetAllButton = getById<HTMLButtonElement>("cfg-reset-all");
const cfgLocQuery = getById<HTMLInputElement>("cfg-loc-query");
const cfgLocSuggestions = getById<HTMLElement>("cfg-loc-suggestions");
const cfgLocMatchesGroup = getById<HTMLElement>("cfg-loc-matches-group");
const cfgLocRecentList = getById<HTMLElement>("cfg-loc-recent-list");
const cfgLocMsg = getById<HTMLElement>("cfg-loc-msg");
const cfgLocCurrent = getById<HTMLElement>("cfg-loc-current");
const cfgLocMapOpen = getById<HTMLButtonElement>("cfg-loc-map-open");
const cfgLocMapModal = getById<HTMLElement>("cfg-loc-map-modal");
const cfgLocMapBackdrop = getById<HTMLElement>("cfg-loc-map-backdrop");
const cfgLocMap = getById<HTMLElement>("cfg-loc-map");
const cfgLocMapGuide = getById<HTMLElement>("cfg-loc-map-guide");
const cfgLocMapGuideLabel = getById<HTMLElement>("cfg-loc-map-guide-label");
const cfgLocMapCoords = getById<HTMLElement>("cfg-loc-map-coords");
const cfgLocMapOk = getById<HTMLButtonElement>("cfg-loc-map-ok");
const cfgLocMapCancel = getById<HTMLButtonElement>("cfg-loc-map-cancel");
const cfgUnitM = getById<HTMLButtonElement>("cfg-unit-m");
const cfgUnitFt = getById<HTMLButtonElement>("cfg-unit-ft");
const buildToolbar = getById<HTMLElement>("build-toolbar");
const buildHint = getById<HTMLElement>("build-hint");
const buildInline = getById<HTMLElement>("build-inline");
const inspectorType = getById<HTMLElement>("ins-type");
const inspectorLabel = getById<HTMLInputElement>("ins-label");
const inspectorX = getById<HTMLInputElement>("ins-x");
const inspectorY = getById<HTMLInputElement>("ins-y");
const inspectorW = getById<HTMLInputElement>("ins-w");
const inspectorD = getById<HTMLInputElement>("ins-d");
const inspectorAngle = getById<HTMLInputElement>("ins-angle");
const inspectorH = getById<HTMLInputElement>("ins-h");
const inspectorColor = getById<HTMLInputElement>("ins-color");
const inspectorOk = getById<HTMLButtonElement>("ins-ok");
const inspectorDelete = getById<HTMLButtonElement>("ins-delete");
inspectorDelete.replaceChildren(createProjectIcon("delete"));

const dom = {
  info: { iAz, iAlt, iRise, iSet, locTag, locTagMobile },
  scrubber: { sDay, sRise, sSet, sRiseLabel, sSetLabel, sThumb },
};

let cfg: AppConfig = structuredClone(DEFAULT);
let month = 6;
let day = 21;
let timeMinutes = 720;
let showTrace = false;
let viewHeightMode: "isometric" | "topdown" = "isometric";
let isTimePlaying = false;
let rafId: number | null = null;
let rafLastTime: number | null = null;
let uiMode: UiMode = "view";
let buildTool: "building" | "wall" | "guide" | "select" | "ruler" = "select";

type ScaleContext = { s: number; ox: number; oy: number; pd: number };
type Selection = { type: "building" | "guide"; index: number } | null;
type ResizeHandle = "bl" | "br" | "tr" | "tl";
type Interaction =
  | null
  | { kind: "creating"; tool: "building" | "wall" | "guide"; start: Point }
  | { kind: "dragging"; selection: NonNullable<Selection>; start: Point; originX: number; originY: number }
  | { kind: "rotating"; selection: NonNullable<Selection>; center: Point; startAngle: number; originAngle: number }
  | { kind: "resizing"; selection: NonNullable<Selection>; handle: ResizeHandle; fixedX: number; fixedY: number };

let selection: Selection = null;
let interaction: Interaction = null;
let lastScale: ScaleContext = { s: 1, ox: 0, oy: 0, pd: 1 };
let locationLookup: LocationLookupController | null = null;
let stagedLocationCandidate: LocationItem | null = null;
let locationMap: import("leaflet").Map | null = null;
let locationMapStreetOverlay: import("leaflet").Layer | null = null;
let leafletLoader: Promise<typeof import("leaflet")> | null = null;
let editingProjectId: string | null = null;
let editingProjectName = "";
type SavedConfigEntry = { id: string; name: string; config: AppConfig; updatedAt: number };
type SavedConfigStore = { activeId: string | null; entries: SavedConfigEntry[] };
type UiPrefs = { season?: { month: number; day: number }; viewMode?: "isometric" | "topdown" };
let savedStore: SavedConfigStore = { activeId: null, entries: [] };
let autosaveTimer: number | null = null;
const undoStack: AppConfig[] = [];
const redoStack: AppConfig[] = [];
const UNDO_LIMIT = 20;
let snapEnabled = false;
let viewZoom = 1.0;
let viewPanX = 0;
let viewPanY = 0;
let threeView: ThreeView | null = null;
let isPanning = false;
let panStartX = 0;
let panStartY = 0;
let showHeatmap = false;
let heatmapGrid: number[][] | null = null;
let heatmapSeenKey = "";
let heatmapComputing = false;
let measurePts: { a: Point | null; b: Point | null } = { a: null, b: null };
let hoverPlotPoint: Point | null = null;
let multiSelections: NonNullable<Selection>[] = [];
let isShiftHeld = false;
let isSpaceHeld = false;
let showBuildingList = false;
let playSpeed = 1;

function setTimePlayButtonState(): void {
  timePlayButton.textContent = isTimePlaying ? "⏸" : "⏵";
  timePlayButton.setAttribute("aria-label", isTimePlaying ? "Pause time animation" : "Play time animation");
  timePlayButton.setAttribute("aria-pressed", isTimePlaying ? "true" : "false");
}

function stopTimePlayback(): void {
  if (rafId !== null) cancelAnimationFrame(rafId);
  rafId = null;
  rafLastTime = null;
  isTimePlaying = false;
  setTimePlayButtonState();
}

function startTimePlayback(): void {
  if ((uiMode !== "view" && uiMode !== "3d") || isTimePlaying) return;
  isTimePlaying = true;
  setTimePlayButtonState();
  const tick = (now: number): void => {
    if (!isTimePlaying) return;
    if (rafLastTime !== null) {
      const elapsed = now - rafLastTime;
      timeMinutes = (timeMinutes + elapsed * 0.08 * playSpeed) % 1440;
      slider.value = String(Math.round(timeMinutes));
      timeInput.value = hhmm(Math.round(timeMinutes));
      render();
    }
    rafLastTime = now;
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

function lerpColor(from: [number, number, number], to: [number, number, number], t: number): string {
  const k = clamp(t, 0, 1);
  const r = Math.round(from[0] + (to[0] - from[0]) * k);
  const g = Math.round(from[1] + (to[1] - from[1]) * k);
  const b = Math.round(from[2] + (to[2] - from[2]) * k);
  return `rgb(${r}, ${g}, ${b})`;
}

function lerpRgb(from: [number, number, number], to: [number, number, number], t: number): [number, number, number] {
  const k = clamp(t, 0, 1);
  return [
    Math.round(from[0] + (to[0] - from[0]) * k),
    Math.round(from[1] + (to[1] - from[1]) * k),
    Math.round(from[2] + (to[2] - from[2]) * k),
  ];
}

function parseHexColor(input: string | undefined, fallback: [number, number, number]): [number, number, number] {
  if (!input) return fallback;
  const hex = input.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    return [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16),
    ];
  }
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    return [
      Number.parseInt(hex[1] + hex[1], 16),
      Number.parseInt(hex[2] + hex[2], 16),
      Number.parseInt(hex[3] + hex[3], 16),
    ];
  }
  return fallback;
}

function rgba(rgb: [number, number, number], alpha: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${clamp(alpha, 0, 1).toFixed(3)})`;
}

function altFactor(altitude: number, fullAt: number, zeroAt: number): number {
  return clamp((altitude - zeroAt) / (fullAt - zeroAt), 0, 1);
}

function altInverseFactor(altitude: number, zeroAt: number, fullAt: number): number {
  return 1 - altFactor(altitude, fullAt, zeroAt);
}

function formatCoordinatePair(lat: number, lng: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(2)}°${latDir} ${Math.abs(lng).toFixed(2)}°${lngDir}`;
}

function getTimeZoneOffsetHours(month: number, day: number, timeZone: string): number | null {
  try {
    const probeUtc = new Date(Date.UTC(new Date().getFullYear(), month - 1, day, 12, 0, 0));
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(probeUtc);
    const byType = Object.fromEntries(parts.filter((p) => p.type !== "literal").map((p) => [p.type, p.value]));
    const year = Number(byType.year);
    const monthIndex = Number(byType.month) - 1;
    const dayOfMonth = Number(byType.day);
    const hour = Number(byType.hour);
    const minute = Number(byType.minute);
    const second = Number(byType.second);
    if ([year, monthIndex, dayOfMonth, hour, minute, second].some((v) => Number.isNaN(v))) return null;
    const asUtcTimestamp = Date.UTC(year, monthIndex, dayOfMonth, hour, minute, second);
    return (asUtcTimestamp - probeUtc.getTime()) / 3600000;
  } catch {
    return null;
  }
}

function getEffectiveUtcOffset(month: number, day: number, location: AppConfig["location"]): number {
  if (location.timeZone) {
    const tzOffset = getTimeZoneOffsetHours(month, day, location.timeZone);
    if (tzOffset !== null) return tzOffset;
  }
  return location.utcOffset ?? 0;
}

function configTokenEncode(config: AppConfig): string {
  const json = JSON.stringify(config);
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function configTokenDecode(token: string): AppConfig | null {
  try {
    const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    const json = new TextDecoder().decode(bytes);
    return normalizeConfig(JSON.parse(json) as AppConfig);
  } catch {
    return null;
  }
}

function normalizedProjectFileName(name: string): string {
  return (name.trim() || "sunshadow-project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function refreshLocationCurrentChip(): void {
  locationLookup?.updateCurrent({
    name: cfg.location.name ?? "Location",
    lat: cfg.location.lat,
    lng: cfg.location.lng,
    timeZone: cfg.location.timeZone,
  });
}

function formatCoordPair(lat: number, lng: number, decimals: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(decimals)}°${latDir}, ${Math.abs(lng).toFixed(decimals)}°${lngDir}`;
}

function normalizeMapCenter(lat: number, lng: number): { lat: number; lng: number } {
  const normalizedLat = clamp(lat, -90, 90);
  let normalizedLng = Number.isFinite(lng) ? lng : 0;
  while (normalizedLng < -180) normalizedLng += 360;
  while (normalizedLng > 180) normalizedLng -= 360;
  return { lat: normalizedLat, lng: normalizedLng };
}

function updateLocationMapCenterPreview(): void {
  if (!locationMap) {
    cfgLocMapCoords.textContent = "Center: —";
    return;
  }
  const center = locationMap.getCenter();
  const normalized = normalizeMapCenter(center.lat, center.lng);
  cfgLocMapCoords.textContent = `Center: ${formatCoordPair(normalized.lat, normalized.lng, 5)}`;
  updateLocationMapGuideSize();
}

function guideMetersForSelectedUnits(): number {
  return cfg.units === "ft" ? 160 / FEET_PER_METER : 50;
}

function guideLabelForSelectedUnits(): string {
  return cfg.units === "ft" ? "160ft x 160ft" : "50m x 50m";
}

function updateLocationMapGuideSize(): void {
  if (!locationMap) return;
  const center = locationMap.getCenter();
  const centerPx = locationMap.latLngToContainerPoint(center);
  const nextPxLatLng = locationMap.containerPointToLatLng([centerPx.x + 1, centerPx.y]);
  const metersPerPixel = locationMap.distance(center, nextPxLatLng);
  if (!Number.isFinite(metersPerPixel) || metersPerPixel <= 0) return;
  const sizePx = guideMetersForSelectedUnits() / metersPerPixel;
  cfgLocMapGuide.style.width = `${sizePx.toFixed(2)}px`;
  cfgLocMapGuide.style.height = `${sizePx.toFixed(2)}px`;
  cfgLocMapGuideLabel.textContent = guideLabelForSelectedUnits();
}

async function loadLeaflet(): Promise<typeof import("leaflet")> {
  if (!leafletLoader) leafletLoader = import("leaflet");
  return leafletLoader;
}

async function ensureLocationMap(): Promise<void> {
  if (locationMap) return;
  const L = await loadLeaflet();
  locationMap = L.map(cfgLocMap, {
    zoomControl: true,
    attributionControl: true,
    maxZoom: 18,
  });
  L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 18,
    maxNativeZoom: 18,
    attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
  }).addTo(locationMap);
  const transportation = L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 18,
      opacity: 0.95,
    },
  );
  const labels = L.tileLayer(
    "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 18,
      opacity: 0.95,
    },
  );
  locationMapStreetOverlay = L.layerGroup([transportation, labels]).addTo(locationMap);
  L.control.layers(undefined, { "Show streets": locationMapStreetOverlay }, { collapsed: true }).addTo(locationMap);
  locationMap.on("move", updateLocationMapCenterPreview);
  locationMap.on("zoom", updateLocationMapCenterPreview);
  locationMap.on("moveend", updateLocationMapCenterPreview);
  const current = normalizeMapCenter(cfg.location.lat, cfg.location.lng);
  locationMap.setView([current.lat, current.lng], DEFAULT_MAP_PICKER_ZOOM, { animate: false });
  updateLocationMapCenterPreview();
}

function hideLocationMapPicker(): void {
  cfgLocMapModal.hidden = true;
  stagedLocationCandidate = null;
  cfgLocMapCoords.textContent = "Center: —";
}

async function openLocationMapPicker(location: LocationItem): Promise<void> {
  stagedLocationCandidate = location;
  cfgLocMapModal.hidden = false;
  cfgLocMapOk.disabled = true;
  cfgLocMapOk.textContent = "Loading map…";
  await ensureLocationMap();
  cfgLocMapOk.disabled = false;
  cfgLocMapOk.textContent = "Use this location";
  if (!locationMap) return;
  const current = normalizeMapCenter(location.lat, location.lng);
  const zoom = Math.max(locationMap.getZoom(), DEFAULT_MAP_PICKER_ZOOM);
  locationMap.setView([current.lat, current.lng], zoom, { animate: false });
  locationMap.invalidateSize();
  window.requestAnimationFrame(() => {
    if (!locationMap) return;
    locationMap.invalidateSize();
    locationMap.setView([current.lat, current.lng], zoom, { animate: false });
    updateLocationMapCenterPreview();
  });
}

function readSavedStore(): SavedConfigStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { activeId: null, entries: [] };
    const parsed = JSON.parse(raw) as SavedConfigStore;
    if (!parsed || !Array.isArray(parsed.entries)) return { activeId: null, entries: [] };
    return {
      activeId: parsed.activeId ?? null,
      entries: parsed.entries
        .filter((e) => e && typeof e.id === "string" && typeof e.name === "string" && e.config)
        .map((e) => ({
          id: e.id,
          name: e.name,
          config: normalizeConfig(e.config),
          updatedAt: Number(e.updatedAt) || Date.now(),
        })),
    };
  } catch {
    return { activeId: null, entries: [] };
  }
}

function readUiPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as UiPrefs;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed;
  } catch {
    return {};
  }
}

function writeUiPrefs(): void {
  const payload: UiPrefs = {
    season: { month, day },
    viewMode: viewHeightMode,
  };
  localStorage.setItem(UI_PREFS_KEY, JSON.stringify(payload));
}

function syncCustomDateInput(): void {
  const input = document.getElementById("custom-date") as HTMLInputElement | null;
  if (!input) return;
  const y = new Date().getFullYear();
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  input.value = `${y}-${mm}-${dd}`;
}

function applySeasonSelection(nextMonth: number, nextDay: number): void {
  month = nextMonth;
  day = nextDay;
  seasonButtons.forEach((button) => {
    const isMatch = Number(button.dataset.month) === nextMonth && Number(button.dataset.day) === nextDay;
    button.classList.toggle("active", isMatch);
  });
  syncCustomDateInput();
}

function writeSavedStore(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(savedStore));
}

function activeEntry(): SavedConfigEntry | undefined {
  return savedStore.entries.find((e) => e.id === savedStore.activeId);
}

function createConfigEntry(name: string, config: AppConfig): SavedConfigEntry {
  return {
    id: `cfg-${Math.random().toString(36).slice(2, 10)}`,
    name: name.trim() || "Untitled",
    config: normalizeConfig(structuredClone(config)),
    updatedAt: Date.now(),
  };
}

function setActiveConfigById(id: string): void {
  const entry = savedStore.entries.find((e) => e.id === id);
  if (!entry) return;
  savedStore.activeId = entry.id;
  writeSavedStore();
  cfg = normalizeConfig(structuredClone(entry.config));
  syncUnitToggle();
  editingProjectId = null;
  editingProjectName = "";
  selection = null;
  clearSunriseSunsetCache();
  resetView();
  renderProjectList();
  updateConfigTextarea();
  refreshLocationCurrentChip();
  syncInspector();
  render();
}

function scheduleAutoSave(): void {
  if (!savedStore.activeId) return;
  if (autosaveTimer !== null) window.clearTimeout(autosaveTimer);
  autosaveTimer = window.setTimeout(() => {
    const entry = activeEntry();
    if (!entry) return;
    entry.config = normalizeConfig(structuredClone(cfg));
    entry.updatedAt = Date.now();
    writeSavedStore();
    autosaveTimer = null;
  }, AUTOSAVE_DELAY_MS);
}

let toastTimer: number | null = null;
function showToast(msg: string, durationMs = 1600): void {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("visible");
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.classList.remove("visible");
    toastTimer = null;
  }, durationMs);
}

function pushUndo(): void {
  undoStack.push(structuredClone(cfg));
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  redoStack.length = 0;
}

function undo(): void {
  const prev = undoStack.pop();
  if (!prev) {
    showToast("Nothing to undo");
    return;
  }
  redoStack.push(structuredClone(cfg));
  cfg = prev;
  heatmapGrid = null;
  clearSunriseSunsetCache();
  selection = null;
  syncUnitToggle();
  updateConfigTextarea();
  refreshLocationCurrentChip();
  syncInspector();
  showToast("Undo");
  render();
}

function redo(): void {
  const next = redoStack.pop();
  if (!next) {
    showToast("Nothing to redo");
    return;
  }
  undoStack.push(structuredClone(cfg));
  cfg = next;
  heatmapGrid = null;
  clearSunriseSunsetCache();
  selection = null;
  syncUnitToggle();
  updateConfigTextarea();
  refreshLocationCurrentChip();
  syncInspector();
  showToast("Redo");
  render();
}

function resetView(): void {
  viewZoom = 1.0;
  viewPanX = 0;
  viewPanY = 0;
}

function maybeSnap(v: number): number {
  return snapEnabled ? Math.round(v * 2) / 2 : v;
}

function computeHeatmap(): number[][] {
  const N = 36;
  const grid = Array.from({ length: N }, () => new Array<number>(N).fill(0));
  const maxShadowDist = Math.sqrt(cfg.plot.width ** 2 + cfg.plot.depth ** 2) * 0.6;
  const buildings = normalizedBuildings();
  const utcOffset = getEffectiveUtcOffset(month, day, cfg.location);
  for (let t = 0; t < 1440; t += 15) {
    const now = localToUTC(month, day, t, utcOffset);
    const sun = sunPos(now, cfg.location.lat, cfg.location.lng);
    if (sun.altitude < 1) continue;
    const polys = buildings.map((b) => shadowPoly(b, sun.azimuth, sun.altitude, maxShadowDist));
    for (let ix = 0; ix < N; ix++) {
      for (let iy = 0; iy < N; iy++) {
        const px = ((ix + 0.5) / N) * cfg.plot.width;
        const py = ((iy + 0.5) / N) * cfg.plot.depth;
        const pt = { x: px, y: py };
        let inShadow = false;
        for (const poly of polys) {
          if (poly && pointInPolygon(pt, poly)) {
            inShadow = true;
            break;
          }
        }
        if (!inShadow) grid[ix][iy]++;
      }
    }
  }
  return grid;
}

let buildingListVersion = "";
function syncBuildingList(): void {
  if (!showBuildingList) return;
  const ver = cfg.buildings
    .map(
      (b, i) =>
        `${b.id}|${b.label}|${b.color}|${b.width ?? b.w}|${b.depth ?? b.d}|${b.roofHeight}|${selection?.type === "building" && selection.index === i ? "sel" : ""}|${multiSelections.some((s) => s.type === "building" && s.index === i) ? "ms" : ""}`,
    )
    .join(";");
  if (ver === buildingListVersion) return;
  buildingListVersion = ver;
  buildingListContent.innerHTML = "";
  const buildings = cfg.buildings;
  if (!buildings.length) {
    const empty = document.createElement("div");
    empty.className = "bldg-list-empty";
    empty.textContent = "No buildings yet";
    buildingListContent.appendChild(empty);
    return;
  }
  const normBuildings = normalizedBuildings();
  buildings.forEach((b, i) => {
    const bNorm = normBuildings[i];
    const row = document.createElement("button");
    const isSelected = selection?.type === "building" && selection.index === i;
    const isMulti = multiSelections.some((s) => s.type === "building" && s.index === i);
    row.className = `bldg-list-row${isSelected || isMulti ? " selected" : ""}`;

    const swatch = document.createElement("span");
    swatch.className = "bldg-list-swatch";
    swatch.style.background = b.color ?? "#eef4ff";

    const info = document.createElement("span");
    info.className = "bldg-list-info";
    const name = b.label || b.id || (b.kind === "wall" ? "Wall" : "Building");
    const unitLabel = cfg.units === "ft" ? "ft" : "m";

    const nameEl = document.createElement("span");
    nameEl.className = "bldg-list-name";
    nameEl.textContent = name;
    const dimsEl = document.createElement("span");
    dimsEl.className = "bldg-list-dims";
    dimsEl.textContent = `${bNorm.w.toFixed(1)}×${bNorm.d.toFixed(1)} ${unitLabel}, H${bNorm.roofHeight.toFixed(1)}`;
    info.appendChild(nameEl);
    info.appendChild(dimsEl);

    row.appendChild(swatch);
    row.appendChild(info);
    row.addEventListener("click", () => {
      if (uiMode === "view") setMode("build");
      selection = { type: "building", index: i };
      multiSelections = [];
      syncInspector();
      render();
    });
    buildingListContent.appendChild(row);
  });
}

function jumpToTime(minutes: number): void {
  if (isTimePlaying) stopTimePlayback();
  timeMinutes = clamp(Math.round(minutes), 0, 1439);
  slider.value = String(timeMinutes);
  timeInput.value = hhmm(timeMinutes);
  render();
}

function normalizeConfig(input: AppConfig): AppConfig {
  const cloned = structuredClone(input);
  return {
    ...cloned,
    units: cloned.units === "ft" ? "ft" : "m",
    guideItems: cloned.guideItems ?? [],
  };
}

function roundDimension(value: number): number {
  return Number(value.toFixed(4));
}

function scaleNumber(value: number, factor: number): number {
  return roundDimension(value * factor);
}

function syncUnitToggle(): void {
  const isMeter = cfg.units !== "ft";
  cfgUnitM.classList.toggle("active", isMeter);
  cfgUnitFt.classList.toggle("active", !isMeter);
  cfgUnitM.setAttribute("aria-pressed", isMeter ? "true" : "false");
  cfgUnitFt.setAttribute("aria-pressed", isMeter ? "false" : "true");
}

function convertConfigUnits(targetUnits: UnitSystem): void {
  const currentUnits: UnitSystem = cfg.units === "ft" ? "ft" : "m";
  if (targetUnits === currentUnits) return;
  pushUndo();
  const factor = targetUnits === "ft" ? FEET_PER_METER : 1 / FEET_PER_METER;

  cfg.plot.width = scaleNumber(cfg.plot.width, factor);
  cfg.plot.depth = scaleNumber(cfg.plot.depth, factor);

  for (const building of cfg.buildings) {
    building.x = scaleNumber(building.x, factor);
    building.y = scaleNumber(building.y, factor);
    if (typeof building.width === "number") building.width = scaleNumber(building.width, factor);
    if (typeof building.depth === "number") building.depth = scaleNumber(building.depth, factor);
    if (typeof building.w === "number") building.w = scaleNumber(building.w, factor);
    if (typeof building.d === "number") building.d = scaleNumber(building.d, factor);
    if (typeof building.roofHeight === "number") building.roofHeight = scaleNumber(building.roofHeight, factor);
    if (typeof building.height === "number") building.height = scaleNumber(building.height, factor);
  }

  for (const guide of cfg.guideItems ?? []) {
    guide.x = scaleNumber(guide.x, factor);
    guide.y = scaleNumber(guide.y, factor);
    guide.width = scaleNumber(guide.width, factor);
    guide.depth = scaleNumber(guide.depth, factor);
  }

  cfg.units = targetUnits;
  updateConfigTextarea();
  syncInspector();
  syncUnitToggle();
  updateLocationMapGuideSize();
  render();
}

function metersToCurrentUnits(valueInMeters: number): number {
  return cfg.units === "ft" ? valueInMeters * FEET_PER_METER : valueInMeters;
}

function createAndActivateProject(name: string, config: AppConfig): void {
  const entry = createConfigEntry(name, config);
  savedStore.entries.unshift(entry);
  savedStore.activeId = entry.id;
  writeSavedStore();
  setActiveConfigById(entry.id);
}

function commitProjectRename(entryId: string): void {
  const entry = savedStore.entries.find((e) => e.id === entryId);
  if (!entry) return;
  const nextName = editingProjectName.trim();
  if (nextName) entry.name = nextName;
  entry.updatedAt = Date.now();
  editingProjectId = null;
  editingProjectName = "";
  writeSavedStore();
  renderProjectList();
}

function removeProject(entryId: string): void {
  if (savedStore.entries.length <= 1) return;
  const wasActive = savedStore.activeId === entryId;
  savedStore.entries = savedStore.entries.filter((entry) => entry.id !== entryId);
  if (wasActive) {
    savedStore.activeId = savedStore.entries[0]?.id ?? null;
  }
  writeSavedStore();
  if (wasActive && savedStore.activeId) setActiveConfigById(savedStore.activeId);
  else renderProjectList();
}

function renderProjectList(): void {
  cfgProjectList.innerHTML = "";
  for (const entry of savedStore.entries) {
    const row = document.createElement("div");
    row.className = `project-row${entry.id === savedStore.activeId ? " current" : ""}`;

    if (editingProjectId === entry.id) {
      const editInput = document.createElement("input");
      editInput.className = "project-edit-input";
      editInput.value = editingProjectName;
      editInput.addEventListener("input", () => {
        editingProjectName = editInput.value;
      });
      editInput.addEventListener("keydown", (event: KeyboardEvent) => {
        if (event.key === "Enter") commitProjectRename(entry.id);
        else if (event.key === "Escape") {
          editingProjectId = null;
          editingProjectName = "";
          renderProjectList();
        }
      });
      editInput.addEventListener("blur", () => {
        commitProjectRename(entry.id);
      });
      row.appendChild(editInput);
      window.setTimeout(() => editInput.focus(), 0);
    } else {
      const nameButton = document.createElement("button");
      nameButton.type = "button";
      nameButton.className = `project-name-btn${entry.id === savedStore.activeId ? " current" : ""}`;
      nameButton.textContent = entry.name;
      nameButton.addEventListener("click", () => {
        setActiveConfigById(entry.id);
      });
      row.appendChild(nameButton);
    }

    const actions = document.createElement("div");
    actions.className = "project-actions";
    if (editingProjectId === entry.id) {
      const saveButton = document.createElement("button");
      saveButton.type = "button";
      saveButton.className = "project-icon-btn";
      saveButton.setAttribute("aria-label", "Save name");
      saveButton.appendChild(createProjectIcon("save"));
      saveButton.addEventListener("click", () => {
        commitProjectRename(entry.id);
      });
      actions.appendChild(saveButton);
    } else {
      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "project-icon-btn";
      editButton.setAttribute("aria-label", "Rename project");
      editButton.appendChild(createProjectIcon("edit"));
      editButton.addEventListener("click", () => {
        editingProjectId = entry.id;
        editingProjectName = entry.name;
        renderProjectList();
      });
      actions.appendChild(editButton);
    }
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "project-icon-btn danger";
    deleteButton.setAttribute("aria-label", "Delete project");
    deleteButton.appendChild(createProjectIcon("delete"));
    deleteButton.disabled = savedStore.entries.length <= 1;
    deleteButton.addEventListener("click", () => {
      removeProject(entry.id);
    });
    actions.appendChild(deleteButton);
    row.appendChild(actions);
    cfgProjectList.appendChild(row);
  }
}

function createProjectIcon(type: "edit" | "save" | "delete"): SVGSVGElement {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("project-icon");
  const path = document.createElementNS(ns, "path");
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  if (type === "edit") {
    path.setAttribute("d", "M3 17.25V21h3.75L19 8.75 15.25 5 3 17.25zM14 6l4 4");
  } else if (type === "save") {
    path.setAttribute("d", "M5 12.5l4 4 10-10");
  } else {
    path.setAttribute("d", "M6 7h12M9 7V5h6v2M10 10v7M14 10v7M8 7l1 13h6l1-13");
  }
  svg.appendChild(path);
  return svg;
}

function normalizedBuildings(): BuildingNormalized[] {
  return cfg.buildings.map((b) => ({
    ...b,
    kind: b.kind ?? "building",
    w: Math.max(0.1, b.width ?? b.w ?? 5),
    d: Math.max(0.1, b.depth ?? b.d ?? 5),
    angleDeg: b.angleDeg ?? 0,
    roofHeight: b.roofHeight ?? b.height ?? 5,
  }));
}

function toCanvas(px: number, py: number, scale: ScaleContext): Point {
  return { x: scale.ox + px * scale.s, y: scale.oy + (scale.pd - py) * scale.s };
}

function toPlot(cx: number, cy: number, scale: ScaleContext): Point {
  return { x: (cx - scale.ox) / scale.s, y: scale.pd - (cy - scale.oy) / scale.s };
}

function drawPolyPath(poly: Point[], scale: ScaleContext): void {
  if (!poly.length) return;
  const p0 = toCanvas(poly[0].x, poly[0].y, scale);
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < poly.length; i += 1) {
    const p = toCanvas(poly[i].x, poly[i].y, scale);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

function cornersFromRect(x: number, y: number, w: number, d: number, angleDeg: number): Point[] {
  const normalized: BuildingNormalized = {
    kind: "building",
    x,
    y,
    w,
    d,
    angleDeg,
    roofHeight: 1,
  };
  return getBuildingCorners(normalized);
}

function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const yi = poly[i].y;
    const xj = poly[j].x;
    const yj = poly[j].y;
    const intersect = yi > p.y !== yj > p.y && p.x < ((xj - xi) * (p.y - yi)) / (yj - yi + 1e-10) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function distancePointToSegment(p: Point, a: Point, b: Point): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq <= 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq, 0, 1);
  const qx = a.x + abx * t;
  const qy = a.y + aby * t;
  return Math.hypot(p.x - qx, p.y - qy);
}

function pointNearPolygonEdges(p: Point, poly: Point[], radius: number): boolean {
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (distancePointToSegment(p, poly[j], poly[i]) <= radius) return true;
  }
  return false;
}

function pointerHitRadiusInPlot(pointerType: string): number {
  const hitPx = pointerType === "touch" ? 18 : 8;
  return hitPx / Math.max(lastScale.s, 1e-6);
}

function getSelectionRect(selectionRef: NonNullable<Selection>): {
  x: number;
  y: number;
  w: number;
  d: number;
  angleDeg: number;
  roofHeight?: number;
} {
  if (selectionRef.type === "building") {
    const b = normalizedBuildings()[selectionRef.index];
    return { x: b.x, y: b.y, w: b.w, d: b.d, angleDeg: b.angleDeg, roofHeight: b.roofHeight };
  }
  const g = (cfg.guideItems ?? [])[selectionRef.index];
  return { x: g.x, y: g.y, w: g.width, d: g.depth, angleDeg: g.angleDeg };
}

function rotationHandlePosition(selectionRef: NonNullable<Selection>): Point {
  const item = getSelectionRect(selectionRef);
  const corners = cornersFromRect(item.x, item.y, item.w, item.d, item.angleDeg);
  const c0 = corners[0];
  const c1 = corners[1];
  const edgeMid = { x: (c0.x + c1.x) / 2, y: (c0.y + c1.y) / 2 };
  const cx = item.x + item.w / 2;
  const cy = item.y + item.d / 2;
  const vx = edgeMid.x - cx;
  const vy = edgeMid.y - cy;
  const len = Math.hypot(vx, vy) || 1;
  return { x: edgeMid.x + (vx / len) * 1.2, y: edgeMid.y + (vy / len) * 1.2 };
}

function hitTest(plotPoint: Point, hitRadius = 0): Selection {
  const guides = cfg.guideItems ?? [];
  const buildings = normalizedBuildings();
  for (let i = buildings.length - 1; i >= 0; i -= 1) {
    const b = buildings[i];
    const poly = getBuildingCorners(b);
    if (pointInPolygon(plotPoint, poly)) return { type: "building", index: i };
    if (hitRadius > 0 && pointNearPolygonEdges(plotPoint, poly, hitRadius)) return { type: "building", index: i };
  }
  for (let i = guides.length - 1; i >= 0; i -= 1) {
    const g = guides[i];
    const poly = cornersFromRect(g.x, g.y, g.width, g.depth, g.angleDeg);
    if (pointInPolygon(plotPoint, poly)) return { type: "guide", index: i };
    if (hitRadius > 0 && pointNearPolygonEdges(plotPoint, poly, hitRadius)) return { type: "guide", index: i };
  }
  return null;
}

function updateConfigTextarea(): void {
  cfgTextArea.value = JSON.stringify(cfg, null, 2);
  scheduleAutoSave();
}

function syncInspector(): void {
  const isBuildLike = uiMode === "build" || uiMode === "3d";
  buildToolbar.hidden = !isBuildLike;
  const isCreating = interaction?.kind === "creating";
  const showInline = isBuildLike && Boolean(selection) && !isCreating;
  buildHint.hidden = uiMode !== "build" || Boolean(selection) || isCreating;
  if (uiMode === "build" && !selection && !isCreating) {
    const hintMap: Record<string, string> = {
      select: "Click a building to select it.",
      building: "Click and drag on the canvas to place a building.",
      wall: "Click and drag on the canvas to place a wall.",
      guide: "Click and drag on the canvas to place a guide.",
      ruler: "Click two points to measure a distance. Esc to clear.",
    };
    buildHint.textContent = hintMap[buildTool] ?? "";
  }
  buildInline.hidden = !showInline;
  if (!showInline || !selection) return;

  const item = getSelectionRect(selection);
  let selectedType: "building" | "wall" | "guide" = "guide";
  if (selection.type === "building") {
    const selectedBuilding = cfg.buildings[selection.index];
    selectedType = selectedBuilding.kind === "wall" ? "wall" : "building";
  }
  inspectorType.textContent = selectedType;
  const label =
    selection.type === "building"
      ? (cfg.buildings[selection.index].label ?? "")
      : ((cfg.guideItems ?? [])[selection.index].label ?? "");
  inspectorLabel.value = label;
  inspectorX.value = item.x.toFixed(2);
  inspectorY.value = item.y.toFixed(2);
  inspectorW.value = item.w.toFixed(2);
  inspectorD.value = item.d.toFixed(2);
  inspectorAngle.value = item.angleDeg.toFixed(1);
  inspectorH.disabled = selection.type === "guide";
  inspectorH.closest("label")?.classList.toggle("disabled", selection.type === "guide");
  inspectorH.value = selection.type === "building" ? (item.roofHeight ?? 1).toFixed(2) : "";
  const isGuide = selection.type === "guide";
  inspectorColor.disabled = isGuide;
  inspectorColor.closest("label")?.classList.toggle("disabled", isGuide);
  const swatchContainer = document.getElementById("color-swatches");
  if (swatchContainer) swatchContainer.style.display = isGuide ? "none" : "flex";
  if (!isGuide) {
    inspectorColor.value = cfg.buildings[selection.index].color ?? "#eef4ff";
  }

  const insArea = document.getElementById("ins-area");
  if (insArea) {
    const u = cfg.units ?? "m";
    const area = item.w * item.d;
    insArea.textContent = `${area < 100 ? area.toFixed(1) : Math.round(area)}${u}²`;
  }
}

function updateSelected(
  updater: (input: {
    x: number;
    y: number;
    w: number;
    d: number;
    angleDeg: number;
    roofHeight?: number;
    label?: string;
  }) => void,
): void {
  if (!selection) return;
  if (selection.type === "building") {
    const b = cfg.buildings[selection.index];
    const mutable = {
      x: b.x,
      y: b.y,
      w: b.width ?? b.w ?? 5,
      d: b.depth ?? b.d ?? 5,
      angleDeg: b.angleDeg ?? 0,
      roofHeight: b.roofHeight ?? b.height ?? 5,
      label: b.label ?? "",
    };
    updater(mutable);
    b.x = mutable.x;
    b.y = mutable.y;
    b.width = mutable.w;
    b.depth = mutable.d;
    b.angleDeg = mutable.angleDeg;
    b.roofHeight = mutable.roofHeight;
    b.label = mutable.label;
  } else {
    const g = (cfg.guideItems ?? [])[selection.index];
    const mutable = {
      x: g.x,
      y: g.y,
      w: g.width,
      d: g.depth,
      angleDeg: g.angleDeg,
      label: g.label ?? "",
    };
    updater(mutable);
    g.x = mutable.x;
    g.y = mutable.y;
    g.width = mutable.w;
    g.depth = mutable.d;
    g.angleDeg = mutable.angleDeg;
    g.label = mutable.label;
  }
  updateConfigTextarea();
  syncInspector();
}

function updateReadouts(
  sunriseSunset: { rise: number | null; set: number | null },
  sun: { azimuth: number; altitude: number },
  location: { name?: string; lat: number; lng: number },
  tMinutes: number,
): void {
  const risePct = ((sunriseSunset.rise ?? 0) / 1440) * 100;
  const setPct = ((sunriseSunset.set ?? 1440) / 1440) * 100;
  dom.scrubber.sDay.style.cssText = `left:${risePct}%;width:${setPct - risePct}%`;
  dom.scrubber.sRise.style.left = `${risePct}%`;
  dom.scrubber.sSet.style.left = `${setPct}%`;
  dom.scrubber.sRiseLabel.style.left = `${risePct}%`;
  dom.scrubber.sRiseLabel.textContent = sunriseSunset.rise !== null ? hhmm(sunriseSunset.rise) : "";
  dom.scrubber.sSetLabel.style.left = `${setPct}%`;
  dom.scrubber.sSetLabel.textContent = sunriseSunset.set !== null ? hhmm(sunriseSunset.set) : "";
  dom.scrubber.sThumb.style.left = `${(tMinutes / 1439) * 100}%`;

  dom.info.iAz.textContent = sun.altitude > 0 ? `${sun.azimuth.toFixed(1)}°` : "below";
  dom.info.iAlt.textContent = `${sun.altitude.toFixed(1)}°`;
  dom.info.iRise.textContent = sunriseSunset.rise !== null ? hhmm(sunriseSunset.rise) : "—";
  dom.info.iSet.textContent = sunriseSunset.set !== null ? hhmm(sunriseSunset.set) : "—";
  const coords = formatCoordinatePair(location.lat, location.lng);
  const locationName = location.name?.trim() || "Location";
  dom.info.locTag.textContent = `${coords} | ${locationName}`;
  dom.info.locTagMobile.textContent = `${coords} | ${locationName}`;
}

function drawBuildingFlat(b: BuildingNormalized, scale: ScaleContext, dimMix: number): void {
  const poly = getBuildingCorners(b);
  const center = toCanvas(b.x + b.w / 2, b.y + b.d / 2, scale);
  ctx.fillStyle = "rgba(26,38,54,0.14)";
  ctx.beginPath();
  drawPolyPath(
    poly.map((p) => ({ x: p.x + 0.12, y: p.y - 0.12 })),
    scale,
  );
  ctx.fill();
  ctx.fillStyle = b.color ?? "#eef4ff";
  ctx.beginPath();
  drawPolyPath(poly, scale);
  ctx.fill();
  const buildingDimAlpha = 0.028 + dimMix * 0.12;
  ctx.fillStyle = `rgba(64,52,36,${buildingDimAlpha.toFixed(3)})`;
  ctx.beginPath();
  drawPolyPath(poly, scale);
  ctx.fill();
  const label = b.label || b.id || (b.kind === "wall" ? "Wall" : "Building");
  const labelSize = Math.round(clamp(scale.s * 1.2, 10, 14));
  ctx.fillStyle = "#1d2f42";
  ctx.font = `700 ${labelSize}px Syne, system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, center.x, uiMode === "build" ? center.y - 7 : center.y);
  if (uiMode === "build") {
    const unitLabel = cfg.units === "ft" ? "ft" : "m";
    const dimLabel = `${b.w.toFixed(1)}×${b.d.toFixed(1)} ${unitLabel}`;
    ctx.font = `400 ${Math.round(clamp(scale.s * 0.9, 8, 11))}px Space Mono, monospace`;
    ctx.fillStyle = "rgba(29,47,66,0.55)";
    ctx.fillText(dimLabel, center.x, center.y + 7);
  }
}

function drawBuildingPseudo3d(
  b: BuildingNormalized,
  scale: ScaleContext,
  dimMix: number,
  sunAzimuth: number,
  viewHeight: "isometric",
): void {
  const base = getBuildingCorners(b);

  const viewScale = viewHeight === "isometric" ? 1.45 : 1;
  const extrusion = b.roofHeight * 0.12 * viewScale;
  const ex = -extrusion;
  const ey = extrusion;
  const top = base.map((p) => ({ x: p.x + ex, y: p.y + ey }));
  const baseRgb = parseHexColor(b.color, [238, 244, 255]);
  const topMul = 1.06 - dimMix * 0.05;
  const topRgb: [number, number, number] = [
    Math.round(clamp(baseRgb[0] * topMul, 0, 255)),
    Math.round(clamp(baseRgb[1] * topMul, 0, 255)),
    Math.round(clamp(baseRgb[2] * topMul, 0, 255)),
  ];
  const sunDir = { x: Math.sin(d2r(sunAzimuth)), y: -Math.cos(d2r(sunAzimuth)) };
  const viewDir = { x: ex, y: ey };
  const faceCandidates: { poly: Point[]; shadeMul: number; avgY: number; viewDot: number }[] = [];

  for (let i = 0; i < base.length; i += 1) {
    const next = (i + 1) % base.length;
    const p0 = base[i];
    const p1 = base[next];
    const e = { x: p1.x - p0.x, y: p1.y - p0.y };
    const n = { x: e.y, y: -e.x };
    const nl = Math.hypot(n.x, n.y) || 1;
    const nd = (n.x * sunDir.x + n.y * sunDir.y) / nl;
    const viewDot = (n.x * viewDir.x + n.y * viewDir.y) / nl;
    const face = [p0, p1, top[next], top[i]];
    const avgY = face.reduce((sum, p) => sum + toCanvas(p.x, p.y, scale).y, 0) / face.length;
    faceCandidates.push({ poly: face, shadeMul: 0.64 + 0.22 * (nd + 1), avgY, viewDot });
  }

  const faces = faceCandidates
    .sort((a, bFace) => a.viewDot - bFace.viewDot)
    .slice(0, 2)
    .sort((a, bFace) => a.avgY - bFace.avgY);
  ctx.fillStyle = "rgba(26,38,54,0.14)";
  ctx.beginPath();
  drawPolyPath(
    base.map((p) => ({ x: p.x + 0.12, y: p.y - 0.12 })),
    scale,
  );
  ctx.fill();

  for (const face of faces) {
    const mul = face.shadeMul * (1 - dimMix * 0.1);
    const sideRgb: [number, number, number] = [
      Math.round(clamp(baseRgb[0] * mul, 0, 255)),
      Math.round(clamp(baseRgb[1] * mul, 0, 255)),
      Math.round(clamp(baseRgb[2] * mul, 0, 255)),
    ];
    ctx.fillStyle = rgba(sideRgb, 0.98);
    ctx.beginPath();
    drawPolyPath(face.poly, scale);
    ctx.fill();
  }

  ctx.fillStyle = rgba(topRgb, 0.98);
  ctx.beginPath();
  drawPolyPath(top, scale);
  ctx.fill();
  const buildingDimAlpha = 0.024 + dimMix * 0.1;
  ctx.fillStyle = `rgba(64,52,36,${buildingDimAlpha.toFixed(3)})`;
  ctx.beginPath();
  drawPolyPath(top, scale);
  ctx.fill();

  const label = b.label || b.id || (b.kind === "wall" ? "Wall" : "Building");
  const centerTop = toCanvas(b.x + b.w / 2 + ex, b.y + b.d / 2 + ey, scale);
  ctx.fillStyle = "#1d2f42";
  ctx.font = `700 ${Math.round(clamp(scale.s * 1.15, 10, 14))}px Syne, system-ui`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, centerTop.x, centerTop.y);
}

function drawNorthArrow(x: number, y: number): void {
  const r = 14;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fill();
  ctx.strokeStyle = "rgba(50,65,80,0.28)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x, y - r + 4);
  ctx.lineTo(x + 4, y + 1);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = "rgba(30,50,70,0.85)";
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(x, y - r + 4);
  ctx.lineTo(x - 4, y + 1);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fillStyle = "rgba(180,195,210,0.85)";
  ctx.fill();

  ctx.fillStyle = "rgba(30,50,70,0.85)";
  ctx.font = "bold 8px Space Mono, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", x, y + r - 5);
  ctx.restore();
}

function render(): void {
  const { location, plot } = cfg;
  const utcOffset = getEffectiveUtcOffset(month, day, location);
  const sunriseSunset = getSunriseSunset(month, day, location.lat, location.lng, utcOffset);
  const now = localToUTC(month, day, timeMinutes, utcOffset);
  const sun = sunPos(now, location.lat, location.lng);
  if (uiMode === "3d") {
    updateReadouts(sunriseSunset, sun, location, timeMinutes);
    if (threeView) threeView.sync(cfg, sun.azimuth, sun.altitude, month, day, location.lat, location.lng, utcOffset);
    return;
  }
  const shadowFade = altFactor(sun.altitude, SHADOW_FADE_ALT_START, SHADOW_FADE_ALT_END);
  const shadowSun = {
    azimuth: sun.azimuth,
    altitude: Math.max(sun.altitude, 0.5),
  };
  const outsideLightMix = altFactor(sun.altitude, TEMP_NIGHT_FULL_ALT, TEMP_NIGHT_ZERO_ALT);
  const W = mainEl.clientWidth;
  const H = mainEl.clientHeight;
  const margin = uiMode === "build" ? Math.max(20, Math.min(W, H) * 0.04) : Math.max(52, Math.min(W, H) * 0.09);
  const sBase = Math.min((W - 2 * margin) / plot.width, (H - 2 * margin) / plot.depth);
  const s = sBase * viewZoom;
  const pw = plot.width * s;
  const ph = plot.depth * s;
  const ox = Math.round((W - pw) / 2 + viewPanX);
  const oy = Math.round((H - ph) / 2 + viewPanY);
  const scale: ScaleContext = { s, ox, oy, pd: plot.depth };
  lastScale = scale;

  const maxShadow = Math.sqrt(plot.width ** 2 + plot.depth ** 2) * 0.6;
  const buildings = normalizedBuildings();
  const guides = cfg.guideItems ?? [];

  ctx.fillStyle = "#f2f6fb";
  ctx.fillRect(0, 0, W, H);

  const centerLight: [number, number, number] = [236, 238, 242];
  const daylightLevel = altFactor(sun.altitude, VIS_DAY_FULL_ALT, VIS_DAY_ZERO_ALT);
  const dimMix = 1 - daylightLevel;
  const gridOpacity = 0.08 + dimMix * 0.07;
  ctx.fillStyle = `rgba(100,115,132,${gridOpacity.toFixed(3)})`;
  for (let x = 10; x < W; x += 22) for (let y = 10; y < H; y += 22) ctx.fillRect(x, y, 1, 1);

  const daylightCool: [number, number, number] = [219, 231, 248];
  const goldenWarm: [number, number, number] = [241, 196, 140];
  const nightDark: [number, number, number] = [66, 56, 48];
  const warmFactor = altInverseFactor(Math.abs(sun.altitude - TEMP_WARM_CENTER_ALT), 0, TEMP_WARM_HALFSPAN);
  const dayCoolFactor = altFactor(sun.altitude, TEMP_COOL_FULL_ALT, TEMP_COOL_ZERO_ALT);
  const baseTemp = lerpRgb(goldenWarm, daylightCool, dayCoolFactor);
  const tempTint = lerpRgb(baseTemp, nightDark, outsideLightMix);

  ctx.fillStyle = lerpColor(centerLight, tempTint, dimMix * (0.3 + warmFactor * 0.14));
  ctx.fillRect(ox, oy, pw, ph);

  ctx.strokeStyle = "rgba(82,109,86,0.16)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= plot.width; x += 5) {
    const a = toCanvas(x, 0, scale);
    const b = toCanvas(x, plot.depth, scale);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (let y = 0; y <= plot.depth; y += 5) {
    const a = toCanvas(0, y, scale);
    const b = toCanvas(plot.width, y, scale);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(63,84,67,0.42)";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(ox, oy, pw, ph);

  {
    const unitLabel = cfg.units === "ft" ? "ft" : "m";
    const edgeColor = "rgba(63,84,67,0.65)";
    ctx.save();
    ctx.font = "11px 'Space Mono', monospace";
    ctx.fillStyle = edgeColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";

    ctx.fillText(`N  ${plot.width}${unitLabel}`, ox + pw / 2, oy - 4);

    ctx.textBaseline = "top";
    ctx.fillText(`S  ${plot.width}${unitLabel}`, ox + pw / 2, oy + ph + 4);

    ctx.save();
    ctx.translate(ox - 4, oy + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textBaseline = "bottom";
    ctx.fillText(`W  ${plot.depth}${unitLabel}`, 0, 0);
    ctx.restore();

    ctx.save();
    ctx.translate(ox + pw + 4, oy + ph / 2);
    ctx.rotate(Math.PI / 2);
    ctx.textBaseline = "bottom";
    ctx.fillText(`E  ${plot.depth}${unitLabel}`, 0, 0);
    ctx.restore();
    ctx.restore();
  }

  if (showHeatmap) {
    const heatKey = `${month}-${day}-${cfg.location.lat}-${cfg.location.lng}-${utcOffset}-${plot.width}-${plot.depth}-${buildings.map((b) => `${b.x},${b.y},${b.w},${b.d},${b.angleDeg},${b.roofHeight}`).join("|")}`;
    if (!heatmapGrid || heatmapSeenKey !== heatKey) {
      if (!heatmapComputing) {
        heatmapComputing = true;
        window.setTimeout(() => {
          try {
            heatmapGrid = computeHeatmap();
            heatmapSeenKey = heatKey;
          } finally {
            heatmapComputing = false;
            render();
          }
        }, 0);
      }
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = "#1a3a5c";
      ctx.fillRect(ox, oy, pw, ph);
      ctx.restore();
      ctx.save();
      ctx.font = "bold 11px 'Space Mono', monospace";
      ctx.fillStyle = "rgba(80,140,200,0.85)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Computing heatmap…", ox + pw / 2, oy + ph / 2);
      ctx.restore();
    } else {
      const N = heatmapGrid.length;
      const maxV = Math.max(...heatmapGrid.map((col) => Math.max(...col)), 1);
      ctx.save();
      ctx.globalAlpha = 0.44;
      ctx.beginPath();
      ctx.rect(ox, oy, pw, ph);
      ctx.clip();
      for (let ix = 0; ix < N; ix++) {
        for (let iy = 0; iy < N; iy++) {
          const v = heatmapGrid[ix][iy] / maxV;
          const cw = pw / N + 0.5;
          const ch = ph / N + 0.5;
          const cx2 = ox + (ix / N) * pw;
          const cy2 = oy + (1 - (iy + 1) / N) * ph;
          const r = Math.round(20 + v * 40);
          const g = Math.round(60 + v * 160);
          const b2 = Math.round(180 - v * 150);
          ctx.fillStyle = `rgb(${r},${g},${b2})`;
          ctx.fillRect(cx2, cy2, cw, ch);
        }
      }
      ctx.restore();
    }
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, pw, ph);
  ctx.clip();

  if (showTrace) {
    ctx.fillStyle = TRACE;
    for (let m = 0; m < 1440; m += 12) {
      const pos = sunPos(localToUTC(month, day, m, utcOffset), location.lat, location.lng);
      if (pos.altitude < TRACE_SHADOW_MIN_ALT) continue;
      for (const b of buildings) {
        const poly = shadowPoly(b, pos.azimuth, pos.altitude, maxShadow);
        if (!poly) continue;
        ctx.beginPath();
        drawPolyPath(poly, scale);
        ctx.fill();
      }
    }
  }

  if (shadowFade > 0.001) {
    ctx.fillStyle = `rgba(52,39,24,${(0.24 * shadowFade).toFixed(3)})`;
    for (const b of buildings) {
      const poly = shadowPoly(b, shadowSun.azimuth, shadowSun.altitude, maxShadow);
      if (!poly) continue;
      ctx.beginPath();
      drawPolyPath(poly, scale);
      ctx.fill();
    }
  }
  ctx.restore();

  {
    let coveredCells = 0,
      totalCells = 0;
    if (shadowFade > 0.001) {
      const CN = 20;
      const bCorners = buildings.map((b) => getBuildingCorners(b));
      const sPolys = buildings.map((b) => shadowPoly(b, shadowSun.azimuth, shadowSun.altitude, maxShadow));
      for (let ix = 0; ix < CN; ix++) {
        for (let iy = 0; iy < CN; iy++) {
          const pt = { x: ((ix + 0.5) / CN) * plot.width, y: ((iy + 0.5) / CN) * plot.depth };
          let inBuilding = false;
          for (const corners of bCorners) {
            if (pointInPolygon(pt, corners)) {
              inBuilding = true;
              break;
            }
          }
          if (inBuilding) continue;
          totalCells++;
          for (const poly of sPolys) {
            if (poly && pointInPolygon(pt, poly)) {
              coveredCells++;
              break;
            }
          }
        }
      }
    }
    icoverage.textContent = totalCells > 0 ? `${Math.round((coveredCells / totalCells) * 100)}%` : "0%";
  }

  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, pw, ph);
  ctx.clip();
  for (const g of guides) {
    const poly = cornersFromRect(g.x, g.y, g.width, g.depth, g.angleDeg);
    ctx.strokeStyle = "rgba(32,90,160,0.85)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    drawPolyPath(poly, scale);
    ctx.stroke();
    ctx.setLineDash([]);
    const center = toCanvas(g.x + g.width / 2, g.y + g.depth / 2, scale);
    ctx.fillStyle = "rgba(32,90,160,0.8)";
    ctx.font = "11px Space Mono, monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const unitLabel = cfg.units === "ft" ? "ft" : "m";
    const areaLabel = `${g.width.toFixed(1)}×${g.depth.toFixed(1)} ${unitLabel}`;
    if (g.label) {
      ctx.fillText(g.label, center.x, center.y - 7);
      ctx.fillText(areaLabel, center.x, center.y + 7);
    } else {
      ctx.fillText(areaLabel, center.x, center.y);
    }
  }
  ctx.restore();
  ctx.setLineDash([]);

  for (const b of buildings) {
    if (uiMode === "view" && viewHeightMode !== "topdown") {
      drawBuildingPseudo3d(b, scale, dimMix, sun.azimuth, viewHeightMode);
    } else drawBuildingFlat(b, scale, dimMix);
  }

  if (uiMode === "view") {
    drawSunCompassDial({
      ctx,
      month,
      day,
      timeMinutes,
      utcOffset,
      sun,
      sunriseSunset,
      lat: location.lat,
      lng: location.lng,
      ox,
      oy,
      pw,
      ph,
      width: W,
      height: H,
    });
  }

  if (uiMode === "view") {
    drawCircularSunMarginMarkers({
      ctx,
      month,
      day,
      utcOffset,
      sun,
      sunriseSunset,
      lat: location.lat,
      lng: location.lng,
      ox,
      oy,
      pw,
      ph,
      width: W,
      height: H,
    });
  }

  if (uiMode === "build" && multiSelections.length > 0) {
    ctx.save();
    ctx.setLineDash([5, 3]);
    for (const ms of multiSelections) {
      if (selection && ms.type === selection.type && ms.index === selection.index) continue;
      const item = getSelectionRect(ms);
      const poly = cornersFromRect(item.x, item.y, item.w, item.d, item.angleDeg);
      ctx.strokeStyle = "rgba(240,162,29,0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      drawPolyPath(poly, scale);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  if (selection && uiMode === "build") {
    const item = getSelectionRect(selection);
    const poly = cornersFromRect(item.x, item.y, item.w, item.d, item.angleDeg);
    ctx.strokeStyle = "rgba(240,162,29,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    drawPolyPath(poly, scale);
    ctx.stroke();
    const h = toCanvas(rotationHandlePosition(selection).x, rotationHandlePosition(selection).y, scale);
    ctx.fillStyle = "#f0a21d";
    ctx.beginPath();
    ctx.arc(h.x, h.y, 5.5, 0, Math.PI * 2);
    ctx.fill();

    const absAngle = ((item.angleDeg % 360) + 360) % 360;
    if (absAngle < 8 || absAngle > 352) {
      const corners = [
        { px: item.x, py: item.y },
        { px: item.x + item.w, py: item.y },
        { px: item.x + item.w, py: item.y + item.d },
        { px: item.x, py: item.y + item.d },
      ];
      ctx.strokeStyle = "#f0a21d";
      ctx.lineWidth = 1.5;
      ctx.fillStyle = "#ffffff";
      for (const { px, py } of corners) {
        const c = toCanvas(px, py, scale);
        ctx.beginPath();
        ctx.rect(c.x - 4.5, c.y - 4.5, 9, 9);
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  if (uiMode === "build" && buildTool === "ruler") {
    const endPt = measurePts.b ?? hoverPlotPoint;
    if (measurePts.a) {
      const ca = toCanvas(measurePts.a.x, measurePts.a.y, scale);
      ctx.fillStyle = "#f0a21d";
      ctx.beginPath();
      ctx.arc(ca.x, ca.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      if (endPt) {
        const cb = toCanvas(endPt.x, endPt.y, scale);
        ctx.strokeStyle = "#f0a21d";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(ca.x, ca.y);
        ctx.lineTo(cb.x, cb.y);
        ctx.stroke();
        ctx.setLineDash([]);
        if (measurePts.b) {
          ctx.fillStyle = "#f0a21d";
          ctx.beginPath();
          ctx.arc(cb.x, cb.y, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
        const dist = Math.hypot(endPt.x - measurePts.a.x, endPt.y - measurePts.a.y);
        const unitFactor = cfg.units === "ft" ? FEET_PER_METER : 1;
        const unitLabel = cfg.units === "ft" ? "ft" : "m";
        const label = `${(dist * unitFactor).toFixed(2)} ${unitLabel}`;
        const mx = (ca.x + cb.x) / 2;
        const my = (ca.y + cb.y) / 2;
        const angle = Math.atan2(cb.y - ca.y, cb.x - ca.x);
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(angle);
        ctx.fillStyle = "rgba(20,28,42,0.88)";
        ctx.font = "700 11px 'Space Mono', monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(label, 0, -5);
        ctx.restore();
      }
    } else if (!measurePts.a) {
      if (hoverPlotPoint) {
        const c = toCanvas(hoverPlotPoint.x, hoverPlotPoint.y, scale);
        ctx.strokeStyle = "rgba(240,162,29,0.6)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(c.x, c.y, 4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  drawNorthArrow(W - 28, 28);
  updateReadouts(sunriseSunset, sun, location, timeMinutes);
  syncBuildingList();
}

function resize(): void {
  const width = mainEl.clientWidth;
  const height = mainEl.clientHeight;
  if (uiMode === "3d") {
    if (threeView) threeView.resize(width, height);
    render();
    return;
  }
  const dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  render();
}

function setMode(mode: UiMode): void {
  uiMode = mode;
  document.body.dataset.mode = mode;
  modeButtons.forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
  buildToolbar.hidden = mode === "view";
  viewHeightWrap.hidden = mode !== "view";
  timePlayButton.hidden = mode === "build";
  timePlayButton.disabled = mode === "build";
  if (mode === "build") stopTimePlayback();
  viewHeightSelect.value = viewHeightMode;
  if (mode !== "build") {
    interaction = null;
    multiSelections = [];
    measurePts = { a: null, b: null };
    hoverPlotPoint = null;
  }

  const compass3d = document.getElementById("compass-3d") as HTMLElement | null;
  if (mode !== "3d") {
    if (threeView) threeView.stopLoop();
    (document.getElementById("bldg-info-card") as HTMLElement).hidden = true;
    if (compass3d) compass3d.hidden = true;
  } else {
    if (compass3d) compass3d.hidden = false;
  }

  if (mode === "3d") {
    const canvas3d = document.getElementById("c3d") as HTMLCanvasElement | null;
    if (canvas3d && !threeView) {
      try {
        threeView = new ThreeView(canvas3d);
      } catch {
        showToast("3D view failed — your browser may not support WebGL.", 5000);
        setMode("view");
        return;
      }
      threeView.onBuildingHover = (b) => {
        const card = document.getElementById("bldg-info-card")!;
        if (!b) {
          card.hidden = true;
          return;
        }
        const w = b.width ?? b.w ?? 1;
        const d = b.depth ?? b.d ?? 1;
        const h = b.roofHeight ?? b.height ?? 3;
        const u = cfg.units ?? "m";
        const f = (v: number) => (Number.isInteger(Math.round(v * 10) / 10) ? String(Math.round(v)) : v.toFixed(1));
        document.getElementById("bic-name")!.textContent = b.label?.trim() || "Building";
        document.getElementById("bic-dims")!.innerHTML =
          `W <b>${f(w)}</b> · D <b>${f(d)}</b> · H <b>${f(h)}</b> <span style="opacity:0.55">${u}</span>`;
        card.hidden = false;
      };

      const compassInner = document.getElementById("compass-inner");
      threeView.onFrame = () => {
        if (compassInner) {
          const heading = threeView!.getCompassHeading();
          compassInner.style.transform = `rotate(${-heading}deg)`;
        }
      };
    }

    threeView?.startLoop();
  }
  syncInspector();
  resize();
}

function setTool(tool: "building" | "wall" | "guide" | "select" | "ruler"): void {
  buildTool = tool;
  toolButtons.forEach((b) => b.classList.toggle("active", b.dataset.tool === tool));
  document.body.dataset.tool = tool;
  if (tool !== "ruler") {
    measurePts = { a: null, b: null };
    hoverPlotPoint = null;
  }
}

function pointerToPlot(event: PointerEvent): Point {
  const rect = canvas.getBoundingClientRect();
  return toPlot(event.clientX - rect.left, event.clientY - rect.top, lastScale);
}

function startCreateItem(tool: "building" | "wall" | "guide", start: Point): void {
  const id = `${tool}-${Math.random().toString(36).slice(2, 8)}`;
  const wallThickness = metersToCurrentUnits(WALL_THICKNESS);
  const defaultWallHeight = metersToCurrentUnits(2.2);
  const defaultBuildingHeight = metersToCurrentUnits(6);
  if (tool === "guide") {
    cfg.guideItems ??= [];
    cfg.guideItems.push({
      id,
      kind: "rectangle",
      x: start.x,
      y: start.y,
      width: 0.2,
      depth: 0.2,
      angleDeg: 0,
      label: "Guide",
    });
    selection = { type: "guide", index: cfg.guideItems.length - 1 };
  } else {
    const isWall = tool === "wall";
    cfg.buildings.push({
      id,
      kind: isWall ? "wall" : "building",
      label: isWall ? "Wall" : "Building",
      x: start.x,
      y: start.y,
      width: isWall ? metersToCurrentUnits(1) : 0.2,
      depth: isWall ? wallThickness : 0.2,
      angleDeg: 0,
      roofHeight: isWall ? defaultWallHeight : defaultBuildingHeight,
      color: isWall ? "#ffffff" : "#eef4ff",
    });
    selection = { type: "building", index: cfg.buildings.length - 1 };
  }
  updateConfigTextarea();
}

canvas.addEventListener("pointerdown", (event) => {
  if (uiMode === "view" || event.button === 1 || (uiMode === "build" && isSpaceHeld)) {
    canvas.setPointerCapture(event.pointerId);
    isPanning = true;
    panStartX = event.clientX - viewPanX;
    panStartY = event.clientY - viewPanY;
    canvas.style.cursor = "grabbing";
    return;
  }
  if (uiMode !== "build") return;
  canvas.setPointerCapture(event.pointerId);
  const plotPoint = pointerToPlot(event);
  const hitRadius = pointerHitRadiusInPlot(event.pointerType);
  const handleRadius = event.pointerType === "touch" ? 1.5 : 0.9;

  if (buildTool === "ruler") {
    if (!measurePts.a) {
      measurePts.a = plotPoint;
      measurePts.b = null;
    } else if (!measurePts.b) {
      measurePts.b = plotPoint;
    } else {
      measurePts.a = plotPoint;
      measurePts.b = null;
    }
    render();
    return;
  }

  if (buildTool !== "select") {
    pushUndo();
    startCreateItem(buildTool, plotPoint);
    interaction = { kind: "creating", tool: buildTool, start: plotPoint };
    syncInspector();
    render();
    return;
  }

  if (selection) {
    const item = getSelectionRect(selection);
    const absAngle = ((item.angleDeg % 360) + 360) % 360;
    if (absAngle < 8 || absAngle > 352) {
      const cornerHandles: { handle: ResizeHandle; px: number; py: number }[] = [
        { handle: "bl", px: item.x, py: item.y },
        { handle: "br", px: item.x + item.w, py: item.y },
        { handle: "tr", px: item.x + item.w, py: item.y + item.d },
        { handle: "tl", px: item.x, py: item.y + item.d },
      ];
      const opposites: Record<ResizeHandle, { x: number; y: number }> = {
        bl: { x: item.x + item.w, y: item.y + item.d },
        br: { x: item.x, y: item.y + item.d },
        tr: { x: item.x, y: item.y },
        tl: { x: item.x + item.w, y: item.y },
      };
      for (const { handle, px, py } of cornerHandles) {
        const dist = Math.hypot(plotPoint.x - px, plotPoint.y - py);
        if (dist <= handleRadius * 1.2) {
          pushUndo();
          const fixed = opposites[handle];
          interaction = { kind: "resizing", selection, handle, fixedX: fixed.x, fixedY: fixed.y };
          syncInspector();
          render();
          return;
        }
      }
    }
  }

  if (selection) {
    const handle = rotationHandlePosition(selection);
    const distToHandle = Math.hypot(plotPoint.x - handle.x, plotPoint.y - handle.y);
    if (distToHandle <= handleRadius) {
      pushUndo();
      const item = getSelectionRect(selection);
      const center = { x: item.x + item.w / 2, y: item.y + item.d / 2 };
      interaction = {
        kind: "rotating",
        selection,
        center,
        startAngle: Math.atan2(plotPoint.y - center.y, plotPoint.x - center.x),
        originAngle: item.angleDeg,
      };
      syncInspector();
      render();
      return;
    }
  }

  const hit = hitTest(plotPoint, hitRadius);

  if (isShiftHeld && hit) {
    const exists = multiSelections.findIndex((s) => s.type === hit.type && s.index === hit.index);
    if (exists >= 0) multiSelections.splice(exists, 1);
    else multiSelections.push(hit);
    selection = hit;
    syncInspector();
    render();
    return;
  }
  if (!isShiftHeld) multiSelections = [];

  selection = hit;
  if (!hit) {
    interaction = null;
    syncInspector();
    render();
    return;
  }

  const handle = rotationHandlePosition(hit);
  const distToHandle = Math.hypot(plotPoint.x - handle.x, plotPoint.y - handle.y);
  const item = getSelectionRect(hit);
  const center = { x: item.x + item.w / 2, y: item.y + item.d / 2 };
  pushUndo();
  if (distToHandle <= handleRadius) {
    interaction = {
      kind: "rotating",
      selection: hit,
      center,
      startAngle: Math.atan2(plotPoint.y - center.y, plotPoint.x - center.x),
      originAngle: item.angleDeg,
    };
  } else {
    interaction = {
      kind: "dragging",
      selection: hit,
      start: plotPoint,
      originX: item.x,
      originY: item.y,
    };
  }
  syncInspector();
  render();
});

canvas.addEventListener("pointermove", (event) => {
  if (isPanning) {
    viewPanX = event.clientX - panStartX;
    viewPanY = event.clientY - panStartY;
    render();
    return;
  }

  if (uiMode === "build" && buildTool === "ruler") {
    hoverPlotPoint = pointerToPlot(event);
    if (!interaction) {
      render();
      return;
    }
  }
  if (!interaction) return;
  const p = pointerToPlot(event);

  if (interaction.kind === "creating" && selection) {
    if (selection.type === "guide") {
      const g = (cfg.guideItems ?? [])[selection.index];
      g.x = maybeSnap(Math.min(interaction.start.x, p.x));
      g.y = maybeSnap(Math.min(interaction.start.y, p.y));
      g.width = Math.max(0.2, maybeSnap(Math.abs(p.x - interaction.start.x)));
      g.depth = Math.max(0.2, maybeSnap(Math.abs(p.y - interaction.start.y)));
      g.angleDeg = 0;
    } else {
      const b = cfg.buildings[selection.index];
      if (interaction.tool === "wall") {
        const mx = (interaction.start.x + p.x) / 2;
        const my = (interaction.start.y + p.y) / 2;
        const len = Math.max(0.5, Math.hypot(p.x - interaction.start.x, p.y - interaction.start.y));
        const wt = metersToCurrentUnits(WALL_THICKNESS);
        b.width = len;
        b.depth = wt;
        b.x = maybeSnap(mx - len / 2);
        b.y = maybeSnap(my - wt / 2);
        b.angleDeg = r2d(Math.atan2(p.y - interaction.start.y, p.x - interaction.start.x));
      } else {
        b.x = maybeSnap(Math.min(interaction.start.x, p.x));
        b.y = maybeSnap(Math.min(interaction.start.y, p.y));
        b.width = Math.max(0.2, maybeSnap(Math.abs(p.x - interaction.start.x)));
        b.depth = Math.max(0.2, maybeSnap(Math.abs(p.y - interaction.start.y)));
        b.angleDeg = 0;
      }
    }
  } else if (interaction.kind === "dragging") {
    const drag = interaction;
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    updateSelected((item) => {
      item.x = maybeSnap(drag.originX + dx);
      item.y = maybeSnap(drag.originY + dy);
    });
  } else if (interaction.kind === "rotating") {
    const rotate = interaction;
    const a = Math.atan2(p.y - rotate.center.y, p.x - rotate.center.x);
    const delta = a - rotate.startAngle;
    updateSelected((item) => {
      item.angleDeg = rotate.originAngle + r2d(delta);
    });
  } else if (interaction.kind === "resizing") {
    const { fixedX, fixedY } = interaction;
    const newX = maybeSnap(Math.min(p.x, fixedX));
    const newY = maybeSnap(Math.min(p.y, fixedY));
    const newW = Math.max(0.1, maybeSnap(Math.abs(p.x - fixedX)));
    const newD = Math.max(0.1, maybeSnap(Math.abs(p.y - fixedY)));
    updateSelected((item) => {
      item.x = newX;
      item.y = newY;
      item.w = newW;
      item.d = newD;
    });
  }

  updateConfigTextarea();
  syncInspector();
  render();
});

canvas.addEventListener("pointerup", (event) => {
  if (isPanning) {
    isPanning = false;
    canvas.style.cursor = uiMode === "build" && isSpaceHeld ? "grab" : "";
    return;
  }
  let shouldSwitchToSelect = false;
  if (interaction?.kind === "creating" && selection) {
    const p = pointerToPlot(event);
    const dx = Math.abs(p.x - interaction.start.x);
    const dy = Math.abs(p.y - interaction.start.y);
    const shouldDiscard = interaction.tool === "wall" ? Math.hypot(dx, dy) < 0.03 : dx < 0.03 && dy < 0.03;
    if (shouldDiscard) {
      if (selection.type === "building") cfg.buildings.splice(selection.index, 1);
      else (cfg.guideItems ?? []).splice(selection.index, 1);
      selection = null;
      undoStack.pop();
      updateConfigTextarea();
    } else {
      shouldSwitchToSelect = true;
    }
  }
  interaction = null;
  if (shouldSwitchToSelect) setTool("select");
  syncInspector();
  render();
});

canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = clamp(viewZoom * factor, 0.25, 8);
    if (newZoom === viewZoom) return;
    const rect = canvas.getBoundingClientRect();
    const cx = event.clientX - rect.left;
    const cy = event.clientY - rect.top;
    const W = mainEl.clientWidth;
    const H = mainEl.clientHeight;
    const { ox: oxBefore, oy: oyBefore, s } = lastScale;
    const sBase = s / viewZoom;
    const ratio = newZoom / viewZoom;
    const newPw = cfg.plot.width * sBase * newZoom;
    const newPh = cfg.plot.depth * sBase * newZoom;
    const oxNew = cx - (cx - oxBefore) * ratio;
    const oyNew = cy - (cy - oyBefore) * ratio;
    viewPanX = oxNew - (W - newPw) / 2;
    viewPanY = oyNew - (H - newPh) / 2;
    viewZoom = newZoom;
    render();
  },
  { passive: false },
);

canvas.addEventListener("dblclick", () => {
  if (viewZoom === 1.0 && viewPanX === 0 && viewPanY === 0) return;
  resetView();
  render();
});

function openPanel(): void {
  cfgPanel.classList.add("open");
  overlay.classList.add("open");
  syncPlotInputs();
}

function closePanel(): void {
  cfgPanel.classList.remove("open");
  overlay.classList.remove("open");
  hideLocationMapPicker();
}

function applyPickedLocationToConfig(location: LocationItem): void {
  pushUndo();
  cfg.location.name = location.name;
  cfg.location.lat = location.lat;
  cfg.location.lng = location.lng;
  cfg.location.timeZone = location.timeZone;
  cfg.location.utcOffset = getEffectiveUtcOffset(month, day, {
    ...cfg.location,
    timeZone: location.timeZone,
  });
  clearSunriseSunsetCache();
  updateConfigTextarea();
  render();
}

function applyJSON(json: string): void {
  try {
    const parsed = normalizeConfig(JSON.parse(json) as AppConfig);
    pushUndo();
    cfg = parsed;
    clearSunriseSunsetCache();
    cfgErr.textContent = "";
    cfgErr.classList.remove("on");
    selection = null;
    syncUnitToggle();
    updateConfigTextarea();
    refreshLocationCurrentChip();
    syncInspector();
    render();
  } catch (error) {
    cfgErr.textContent = `JSON error: ${error instanceof Error ? error.message : String(error)}`;
    cfgErr.classList.add("on");
  }
}

getById<HTMLButtonElement>("cfg-open").addEventListener("click", openPanel);
getById<HTMLButtonElement>("cfg-close").addEventListener("click", closePanel);
overlay.addEventListener("click", closePanel);
cfgLocMapOpen.addEventListener("click", () => {
  void openLocationMapPicker({
    name: cfg.location.name ?? "Location",
    lat: cfg.location.lat,
    lng: cfg.location.lng,
  });
});
cfgLocMapBackdrop.addEventListener("click", hideLocationMapPicker);
cfgLocMapCancel.addEventListener("click", hideLocationMapPicker);
cfgLocMapOk.addEventListener("click", async () => {
  if (!locationLookup || !locationMap || !stagedLocationCandidate) return;
  const center = locationMap.getCenter();
  const normalizedCenter = normalizeMapCenter(center.lat, center.lng);
  await locationLookup.applyPickedLocation({
    name: stagedLocationCandidate.name,
    lat: normalizedCenter.lat,
    lng: normalizedCenter.lng,
  });
  hideLocationMapPicker();
});

getById<HTMLButtonElement>("applybtn").addEventListener("click", () => applyJSON(cfgTextArea.value));
cfgNewButton.addEventListener("click", () => {
  createAndActivateProject("Untitled", DEFAULT);
});
cfgDuplicateButton.addEventListener("click", () => {
  const baseName = activeEntry()?.name ?? "Project";
  createAndActivateProject(`${baseName} Copy`, cfg);
});
cfgDownloadButton.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = normalizedProjectFileName(activeEntry()?.name ?? "sunshadow-project");
  a.href = url;
  a.download = `${slug}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
cfgUploadButton.addEventListener("click", () => {
  cfgUploadInput.click();
});
cfgUploadInput.addEventListener("change", async () => {
  const file = cfgUploadInput.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = normalizeConfig(JSON.parse(text) as AppConfig);
    const baseName = file.name.replace(/\.json$/i, "").trim() || "Imported Project";
    createAndActivateProject(baseName, parsed);
    cfgErr.textContent = "";
    cfgErr.classList.remove("on");
  } catch (error) {
    cfgErr.textContent = `Import error: ${error instanceof Error ? error.message : String(error)}`;
    cfgErr.classList.add("on");
  } finally {
    cfgUploadInput.value = "";
  }
});
cfgResetAllButton.addEventListener("click", () => {
  if (!window.confirm("Delete all saved projects and reset to defaults?")) return;
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(UI_PREFS_KEY);
  window.location.reload();
});
cfgShareButton.addEventListener("click", async () => {
  const token = configTokenEncode(cfg);
  const shareUrl = `${window.location.origin}${window.location.pathname}#cfg=${token}`;
  if (shareUrl.length > 2000) {
    showToast(`Link is ${shareUrl.length} chars — some browsers may truncate URLs over 2000 chars.`, 4000);
  }
  try {
    await navigator.clipboard.writeText(shareUrl);
    cfgShareButton.textContent = "Copied!";
    window.setTimeout(() => {
      cfgShareButton.textContent = "Share link";
    }, 1100);
  } catch {
    window.prompt("Copy share link", shareUrl);
  }
});
cfgUnitM.addEventListener("click", () => {
  convertConfigUnits("m");
  syncPlotInputs();
});
cfgUnitFt.addEventListener("click", () => {
  convertConfigUnits("ft");
  syncPlotInputs();
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode((button.dataset.mode as UiMode) ?? "view"));
});
toolButtons.forEach((button) => {
  button.addEventListener("click", () =>
    setTool((button.dataset.tool as "building" | "wall" | "guide" | "select" | "ruler") ?? "select"),
  );
});

seasonButtons.forEach((button) => {
  button.addEventListener("click", () => {
    applySeasonSelection(Number(button.dataset.month), Number(button.dataset.day));
    writeUiPrefs();
    render();
  });
});

const customDateInput = document.getElementById("custom-date") as HTMLInputElement | null;
if (customDateInput) {
  customDateInput.addEventListener("change", () => {
    const [, mm, dd] = customDateInput.value.split("-").map(Number);
    if (!mm || !dd) return;
    month = mm;
    day = dd;
    seasonButtons.forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.month) === mm && Number(b.dataset.day) === dd);
    });
    clearSunriseSunsetCache();
    writeUiPrefs();
    render();
  });
}

const icoverage = getById<HTMLElement>("icoverage");
const heatmapToggleInput = document.getElementById("heatmap-toggle") as HTMLInputElement | null;
const buildingListPanel = getById<HTMLElement>("bldg-list-panel");
const buildingListContent = getById<HTMLElement>("bldg-list-content");
const buildingListToggleBtn = getById<HTMLButtonElement>("bldg-list-toggle");
const buildingListCloseBtn = getById<HTMLButtonElement>("bldg-list-close");
const snapToggleBtn = document.getElementById("snap-toggle") as HTMLButtonElement | null;
if (snapToggleBtn) {
  snapToggleBtn.addEventListener("click", () => {
    snapEnabled = !snapEnabled;
    snapToggleBtn.classList.toggle("active", snapEnabled);
  });
}

if (heatmapToggleInput) {
  heatmapToggleInput.addEventListener("change", () => {
    showHeatmap = heatmapToggleInput.checked;
    if (showHeatmap) heatmapGrid = null;
    render();
  });
}

buildingListToggleBtn.addEventListener("click", () => {
  showBuildingList = !showBuildingList;
  buildingListPanel.hidden = !showBuildingList;
  if (showBuildingList) syncBuildingList();
});
buildingListCloseBtn.addEventListener("click", () => {
  showBuildingList = false;
  buildingListPanel.hidden = true;
});

slider.addEventListener("input", () => {
  if (isTimePlaying) stopTimePlayback();
  timeMinutes = Number(slider.value);
  timeInput.value = hhmm(timeMinutes);
  render();
});

timeInput.addEventListener("change", () => {
  if (isTimePlaying) stopTimePlayback();
  const [h, m] = timeInput.value.split(":").map(Number);
  timeMinutes = h * 60 + (m || 0);
  slider.value = String(timeMinutes);
  render();
});
timePlayButton.addEventListener("click", () => {
  if (isTimePlaying) stopTimePlayback();
  else startTimePlayback();
});

document.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach((btn) => {
  btn.addEventListener("click", () => {
    playSpeed = Number(btn.dataset.speed);
    document.querySelectorAll("[data-speed]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    if (!isTimePlaying) startTimePlayback();
  });
});

traceCheckbox.addEventListener("change", (event: Event) => {
  showTrace = (event.target as HTMLInputElement).checked;
  render();
});
viewHeightSelect.addEventListener("change", () => {
  const value = viewHeightSelect.value;
  if (value === "isometric" || value === "topdown") {
    viewHeightMode = value;
    writeUiPrefs();
  }
  render();
});

function bindInspectorNumber(input: HTMLInputElement, apply: (value: number) => void): void {
  input.addEventListener("change", () => {
    const value = Number(input.value);
    if (Number.isNaN(value)) return;
    pushUndo();
    apply(value);
    syncInspector();
    render();
  });
}

inspectorLabel.addEventListener("change", () => {
  pushUndo();
  updateSelected((item) => {
    item.label = inspectorLabel.value;
  });
  syncInspector();
  render();
});
bindInspectorNumber(inspectorX, (value) => updateSelected((item) => (item.x = value)));
bindInspectorNumber(inspectorY, (value) => updateSelected((item) => (item.y = value)));
bindInspectorNumber(inspectorW, (value) => updateSelected((item) => (item.w = Math.max(0.1, value))));
bindInspectorNumber(inspectorD, (value) => updateSelected((item) => (item.d = Math.max(0.1, value))));
bindInspectorNumber(inspectorAngle, (value) => updateSelected((item) => (item.angleDeg = value)));
bindInspectorNumber(inspectorH, (value) => {
  updateSelected((item) => {
    if (item.roofHeight !== undefined) item.roofHeight = Math.max(0.1, value);
  });
});

inspectorDelete.addEventListener("click", () => {
  if (!selection) return;
  pushUndo();
  if (selection.type === "building") cfg.buildings.splice(selection.index, 1);
  else (cfg.guideItems ?? []).splice(selection.index, 1);
  selection = null;
  updateConfigTextarea();
  syncInspector();
  render();
});
inspectorColor.addEventListener("change", () => {
  if (!selection || selection.type === "guide") return;
  pushUndo();
  cfg.buildings[selection.index].color = inspectorColor.value;
  updateConfigTextarea();
  render();
});

document.querySelectorAll<HTMLButtonElement>(".c-swatch").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (!selection || selection.type === "guide") return;
    const color = btn.dataset.color ?? "#eef4ff";
    pushUndo();
    cfg.buildings[selection.index].color = color;
    inspectorColor.value = color;
    heatmapGrid = null;
    updateConfigTextarea();
    render();
  });
});

function syncPlotInputs(): void {
  const w = document.getElementById("cfg-plot-w") as HTMLInputElement | null;
  const d = document.getElementById("cfg-plot-d") as HTMLInputElement | null;
  const u = document.getElementById("cfg-plot-unit");
  if (w) w.value = String(Math.round(cfg.plot.width));
  if (d) d.value = String(Math.round(cfg.plot.depth));
  if (u) u.textContent = cfg.units ?? "m";
}
(document.getElementById("cfg-plot-w") as HTMLInputElement).addEventListener("change", (e) => {
  const v = parseFloat((e.target as HTMLInputElement).value);
  if (!isFinite(v) || v < 1) return;
  pushUndo();
  heatmapGrid = null;
  cfg.plot.width = v;
  updateConfigTextarea();
  render();
});
(document.getElementById("cfg-plot-d") as HTMLInputElement).addEventListener("change", (e) => {
  const v = parseFloat((e.target as HTMLInputElement).value);
  if (!isFinite(v) || v < 1) return;
  pushUndo();
  heatmapGrid = null;
  cfg.plot.depth = v;
  updateConfigTextarea();
  render();
});

inspectorOk.addEventListener("click", () => {
  selection = null;
  interaction = null;
  syncInspector();
  render();
});

window.addEventListener("keyup", (event: KeyboardEvent) => {
  if (event.key === "Shift") isShiftHeld = false;
  if (event.key === " ") {
    isSpaceHeld = false;
    if (uiMode === "build" && !isPanning) canvas.style.cursor = "";
  }
});
window.addEventListener("resize", resize);

window.addEventListener("keydown", (event: KeyboardEvent) => {
  if (event.key === "Shift") isShiftHeld = true;
  const active = document.activeElement;
  const inInput = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement;
  if (event.key === " " && uiMode === "build" && !inInput) {
    isSpaceHeld = true;
    canvas.style.cursor = "grab";
    event.preventDefault();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "z" && !event.shiftKey) {
    if (inInput) return;
    event.preventDefault();
    undo();
    return;
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === "y" || (event.key === "z" && event.shiftKey))) {
    if (inInput) return;
    event.preventDefault();
    redo();
    return;
  }
  if (!inInput && event.key === "r" && uiMode === "3d") {
    event.preventDefault();
    if (threeView) threeView.resetCamera(cfg.plot.width, cfg.plot.depth);
    return;
  }
  if (uiMode !== "build" || inInput) return;
  if (event.key === "Escape") {
    if (buildTool === "ruler") {
      measurePts = { a: null, b: null };
      hoverPlotPoint = null;
      selection = null;
      multiSelections = [];
      syncInspector();
      render();
      return;
    }
  }
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) {
    if (!selection) return;
    event.preventDefault();
    const step = (snapEnabled ? 0.5 : 0.1) * (event.shiftKey ? 10 : 1);
    const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    const dy = event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0;
    pushUndo();
    updateSelected((item) => {
      item.x = maybeSnap(item.x + dx);
      item.y = maybeSnap(item.y + dy);
    });
    syncInspector();
    render();
    return;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    if (multiSelections.length > 1) {
      event.preventDefault();
      pushUndo();
      const bIdxs = [...new Set(multiSelections.filter((s) => s.type === "building").map((s) => s.index))].sort(
        (a, b) => b - a,
      );
      const gIdxs = [...new Set(multiSelections.filter((s) => s.type === "guide").map((s) => s.index))].sort(
        (a, b) => b - a,
      );
      for (const i of bIdxs) cfg.buildings.splice(i, 1);
      for (const i of gIdxs) (cfg.guideItems ?? []).splice(i, 1);
      const total = bIdxs.length + gIdxs.length;
      selection = null;
      multiSelections = [];
      updateConfigTextarea();
      syncInspector();
      showToast(`Deleted ${total} item${total !== 1 ? "s" : ""}`);
      render();
      return;
    }
    if (!selection) return;
    event.preventDefault();
    pushUndo();
    if (selection.type === "building") cfg.buildings.splice(selection.index, 1);
    else (cfg.guideItems ?? []).splice(selection.index, 1);
    selection = null;
    updateConfigTextarea();
    syncInspector();
    showToast("Deleted");
    render();
  } else if ((event.ctrlKey || event.metaKey) && event.key === "d") {
    if (!selection) return;
    event.preventDefault();
    pushUndo();
    if (selection.type === "building") {
      const orig = cfg.buildings[selection.index];
      cfg.buildings.push({
        ...structuredClone(orig),
        id: `building-${Math.random().toString(36).slice(2, 8)}`,
        x: orig.x + 1,
        y: orig.y + 1,
      });
      selection = { type: "building", index: cfg.buildings.length - 1 };
    } else {
      const guides = cfg.guideItems ?? [];
      const orig = guides[selection.index];
      guides.push({
        ...structuredClone(orig),
        id: `guide-${Math.random().toString(36).slice(2, 8)}`,
        x: orig.x + 1,
        y: orig.y + 1,
      });
      selection = { type: "guide", index: guides.length - 1 };
    }
    updateConfigTextarea();
    syncInspector();
    render();
  } else if (event.key === "Escape") {
    if (interaction?.kind === "creating" && selection) {
      if (selection.type === "building") cfg.buildings.splice(selection.index, 1);
      else (cfg.guideItems ?? []).splice(selection.index, 1);
      undoStack.pop();
      updateConfigTextarea();
    }
    interaction = null;
    selection = null;
    multiSelections = [];
    syncInspector();
    render();
  }
});

getById<HTMLButtonElement>("jump-rise").addEventListener("click", () => {
  const ss = getSunriseSunset(
    month,
    day,
    cfg.location.lat,
    cfg.location.lng,
    getEffectiveUtcOffset(month, day, cfg.location),
  );
  if (ss.rise !== null) jumpToTime(ss.rise);
});
getById<HTMLButtonElement>("jump-noon").addEventListener("click", () => {
  const ss = getSunriseSunset(
    month,
    day,
    cfg.location.lat,
    cfg.location.lng,
    getEffectiveUtcOffset(month, day, cfg.location),
  );
  const noon = ss.rise !== null && ss.set !== null ? (ss.rise + ss.set) / 2 : 720;
  jumpToTime(noon);
});
getById<HTMLButtonElement>("jump-set").addEventListener("click", () => {
  const ss = getSunriseSunset(
    month,
    day,
    cfg.location.lat,
    cfg.location.lng,
    getEffectiveUtcOffset(month, day, cfg.location),
  );
  if (ss.set !== null) jumpToTime(ss.set);
});

getById<HTMLButtonElement>("btn-export-png").addEventListener("click", () => {
  const slug = normalizedProjectFileName(activeEntry()?.name ?? "shadow-export");
  const doSave = (blob: Blob | null) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.png`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Saved PNG");
  };
  if (uiMode === "3d" && threeView) {
    threeView.snapshot(doSave);
  } else {
    canvas.toBlob(doSave);
  }
});

const shortcutsModal = document.getElementById("shortcuts-modal")!;
document.getElementById("btn-help")!.addEventListener("click", () => {
  shortcutsModal.hidden = false;
});
document.getElementById("shortcuts-close")!.addEventListener("click", () => {
  shortcutsModal.hidden = true;
});
document.getElementById("shortcuts-backdrop")!.addEventListener("click", () => {
  shortcutsModal.hidden = true;
});
window.addEventListener("keydown", (e) => {
  const inInput =
    document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLTextAreaElement;
  if (!inInput && e.key === "?") {
    shortcutsModal.hidden = !shortcutsModal.hidden;
    return;
  }
  if (e.key === "Escape" && !shortcutsModal.hidden) {
    shortcutsModal.hidden = true;
  }
});

savedStore = readSavedStore();
if (!savedStore.entries.length) {
  const entry = createConfigEntry("Default", DEFAULT);
  savedStore.entries = [entry];
  savedStore.activeId = entry.id;
}
if (!savedStore.activeId || !savedStore.entries.some((e) => e.id === savedStore.activeId)) {
  savedStore.activeId = savedStore.entries[0].id;
}
const hashTokenMatch = window.location.hash.match(/(?:^#|#.*&)cfg=([^&]+)/);
const shared = hashTokenMatch ? configTokenDecode(hashTokenMatch[1]) : null;
if (shared) {
  cfg = shared;
  const entry = createConfigEntry("Shared Import", shared);
  savedStore.entries.push(entry);
  savedStore.activeId = entry.id;
  history.replaceState(null, "", window.location.pathname + window.location.search);
} else {
  const active = activeEntry();
  cfg = normalizeConfig(structuredClone(active ? active.config : DEFAULT));
}
const uiPrefs = readUiPrefs();
const rawViewMode = uiPrefs.viewMode as string | undefined;
if (rawViewMode === "isometric" || rawViewMode === "20") viewHeightMode = "isometric";
else if (rawViewMode === "topdown") viewHeightMode = "topdown";
if (uiPrefs.season) {
  applySeasonSelection(uiPrefs.season.month, uiPrefs.season.day);
} else {
  applySeasonSelection(month, day);
}
writeSavedStore();
renderProjectList();
syncUnitToggle();
locationLookup = new LocationLookupController(
  {
    queryInput: cfgLocQuery,
    suggestions: cfgLocSuggestions,
    matchesGroup: cfgLocMatchesGroup,
    recentList: cfgLocRecentList,
    message: cfgLocMsg,
    current: cfgLocCurrent,
  },
  {
    onCandidateSelect: async (location) => {
      await openLocationMapPicker(location);
    },
    onPick: applyPickedLocationToConfig,
  },
);
refreshLocationCurrentChip();
updateConfigTextarea();
setTimePlayButtonState();
setMode("view");
setTool("select");
resize();
