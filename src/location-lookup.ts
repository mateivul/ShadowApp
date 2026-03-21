export type LocationItem = {
  name: string;
  lat: number;
  lng: number;
  timeZone?: string;
};

type Elements = {
  queryInput: HTMLInputElement;
  suggestions: HTMLElement;
  matchesGroup: HTMLElement;
  recentList: HTMLElement;
  message: HTMLElement;
  current: HTMLElement;
};

type Options = {
  onPick: (location: LocationItem) => void | Promise<void>;
  onCandidateSelect?: (location: LocationItem, fromSearch: boolean) => void | Promise<void>;
  storageKey?: string;
  maxHistory?: number;
  debounceMs?: number;
};

type LocationSuggestionItem = LocationItem & {
  displayName: string;
};

const DEFAULT_STORAGE_KEY = "sunshadow-location-history-v1";
const DEFAULT_MAX_HISTORY = 8;
const DEFAULT_DEBOUNCE_MS = 320;

function formatCoordPair(lat: number, lng: number, decimals: number): string {
  const latDir = lat >= 0 ? "N" : "S";
  const lngDir = lng >= 0 ? "E" : "W";
  return `${Math.abs(lat).toFixed(decimals)}°${latDir}, ${Math.abs(lng).toFixed(decimals)}°${lngDir}`;
}

function shortenDisplayName(displayName: string): string {
  const segments = displayName
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (!segments.length) return displayName.trim();
  if (segments.length === 1) return segments[0];
  const country = segments[segments.length - 1];
  const city = segments[segments.length - 2];
  if (!city) return country;
  if (city === country) return city;
  return `${city}, ${country}`;
}

export class LocationLookupController {
  private readonly elements: Elements;
  private readonly onPick: (location: LocationItem) => void;
  private readonly onCandidateSelect: ((location: LocationItem, fromSearch: boolean) => void | Promise<void>) | null;
  private readonly storageKey: string;
  private readonly maxHistory: number;
  private readonly debounceMs: number;
  private debounceTimer: number | null = null;
  private history: LocationItem[] = [];
  private suggestions: LocationSuggestionItem[] = [];
  private clearMessageTimer: number | null = null;

  constructor(elements: Elements, options: Options) {
    this.elements = elements;
    this.onPick = options.onPick;
    this.onCandidateSelect = options.onCandidateSelect ?? null;
    this.storageKey = options.storageKey ?? DEFAULT_STORAGE_KEY;
    this.maxHistory = options.maxHistory ?? DEFAULT_MAX_HISTORY;
    this.debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.history = this.readHistory();
    this.bindEvents();
    this.setMessage("");
    this.renderHistory();
  }

  private bindEvents(): void {
    this.elements.queryInput.addEventListener("input", () => {
      this.scheduleSearch();
    });
    this.elements.queryInput.addEventListener("keydown", (event: KeyboardEvent) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (this.suggestions.length) void this.selectLocationCandidate(this.suggestions[0], true);
    });
  }

  private scheduleSearch(): void {
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    const query = this.elements.queryInput.value.trim();
    if (!query.length) {
      this.suggestions = [];
      this.renderSuggestions();
      this.setMessage("");
      return;
    }
    if (query.length < 2) {
      this.suggestions = [];
      this.renderSuggestions();
      this.setMessage("Type at least 2 characters.");
      return;
    }
    this.setMessage("Searching...");
    this.debounceTimer = window.setTimeout(() => {
      void this.search(query);
    }, this.debounceMs);
  }

  private async search(query: string): Promise<void> {
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&q=${encodeURIComponent(query)}`;
      const response = await fetch(url, { headers: { "Accept-Language": "en" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = (await response.json()) as Array<{ display_name?: string; lat?: string; lon?: string }>;
      this.suggestions = data
        .map((item) => ({
          displayName: item.display_name ?? "",
          shortName: shortenDisplayName(item.display_name ?? ""),
          lat: Number(item.lat),
          lng: Number(item.lon),
        }))
        .filter((item) => item.displayName && item.shortName && Number.isFinite(item.lat) && Number.isFinite(item.lng))
        .map((item) => ({ name: item.shortName, displayName: item.displayName, lat: item.lat, lng: item.lng }))
        .slice(0, 6);
      this.renderSuggestions();
      this.setMessage(this.suggestions.length ? "" : "No locations found.");
    } catch {
      this.suggestions = [];
      this.renderSuggestions();
      this.setMessage("Search failed. Try again in a few seconds.");
    }
  }

  private renderSuggestions(): void {
    this.elements.suggestions.innerHTML = "";
    if (!this.suggestions.length) {
      this.elements.matchesGroup.hidden = true;
      return;
    }
    this.elements.matchesGroup.hidden = false;
    this.suggestions.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mini-btn cfg-loc-btn";
      const main = document.createElement("span");
      main.className = "cfg-loc-btn-main";
      main.textContent = item.displayName;
      const sub = document.createElement("span");
      sub.className = "cfg-loc-btn-sub";
      sub.textContent = formatCoordPair(item.lat, item.lng, 4);
      button.append(main, sub);
      button.addEventListener("click", () => {
        void this.selectLocationCandidate({ name: item.name, lat: item.lat, lng: item.lng }, true);
      });
      this.elements.suggestions.appendChild(button);
    });
  }

  private renderHistory(): void {
    this.elements.recentList.innerHTML = "";
    if (!this.history.length) {
      const empty = document.createElement("div");
      empty.className = "cfg-loc-msg cfg-loc-msg-inline";
      empty.textContent = "No recent locations yet.";
      this.elements.recentList.appendChild(empty);
      return;
    }
    this.history.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mini-btn cfg-loc-btn";
      const main = document.createElement("span");
      main.className = "cfg-loc-btn-main";
      main.textContent = item.name;
      const sub = document.createElement("span");
      sub.className = "cfg-loc-btn-sub";
      sub.textContent = formatCoordPair(item.lat, item.lng, 2);
      button.append(main, sub);
      button.addEventListener("click", () => {
        void this.selectLocationCandidate(item, false);
      });
      this.elements.recentList.appendChild(button);
    });
  }

  private async selectLocationCandidate(location: LocationItem, fromSearch: boolean): Promise<void> {
    if (this.onCandidateSelect) {
      if (fromSearch) this.elements.queryInput.value = location.name;
      this.suggestions = [];
      this.elements.matchesGroup.hidden = true;
      this.setMessage("");
      await this.onCandidateSelect(location, fromSearch);
      return;
    }
    await this.pickLocation(location, fromSearch);
  }

  public async applyPickedLocation(location: LocationItem): Promise<void> {
    await this.pickLocation(location, false);
  }

  private async pickLocation(location: LocationItem, fromSearch: boolean): Promise<void> {
    this.setMessage("Resolving timezone...");
    const timeZone = await this.resolveTimeZone(location);
    const applied: LocationItem = { ...location, timeZone: timeZone ?? location.timeZone };
    await this.onPick(applied);
    this.upsertHistory(applied);
    this.updateCurrent(applied);
    if (fromSearch) this.elements.queryInput.value = location.name;
    this.suggestions = [];
    this.elements.matchesGroup.hidden = true;
    this.setMessage(timeZone ? "Location + timezone updated." : "Location updated (timezone unresolved).", 1700);
  }

  private upsertHistory(location: LocationItem): void {
    const normalizedName = location.name.trim().toLowerCase();
    this.history = [
      location,
      ...this.history.filter(
        (item) =>
          !(
            item.name.trim().toLowerCase() === normalizedName &&
            Math.abs(item.lat - location.lat) < 1e-6 &&
            Math.abs(item.lng - location.lng) < 1e-6
          ),
      ),
    ].slice(0, this.maxHistory);
    this.writeHistory();
    this.renderHistory();
  }

  private setMessage(message: string, clearAfterMs?: number): void {
    if (this.clearMessageTimer !== null) {
      window.clearTimeout(this.clearMessageTimer);
      this.clearMessageTimer = null;
    }
    this.elements.message.textContent = message;
    if (message && clearAfterMs) {
      this.clearMessageTimer = window.setTimeout(() => {
        this.elements.message.textContent = "";
        this.clearMessageTimer = null;
      }, clearAfterMs);
    }
  }

  public updateCurrent(location: LocationItem): void {
    const tz = location.timeZone ? ` · ${location.timeZone}` : "";
    this.elements.current.textContent = `Current: ${location.name} (${formatCoordPair(location.lat, location.lng, 2)})${tz}`;
  }

  private async resolveTimeZone(location: LocationItem): Promise<string | null> {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lng}&current=temperature_2m&forecast_days=1&timezone=auto`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const data = (await response.json()) as { timezone?: string };
      return typeof data.timezone === "string" && data.timezone.length > 0 ? data.timezone : null;
    } catch {
      return null;
    }
  }

  private readHistory(): LocationItem[] {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as LocationItem[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter(
          (item) => item && typeof item.name === "string" && Number.isFinite(item.lat) && Number.isFinite(item.lng),
        )
        .slice(0, this.maxHistory);
    } catch {
      return [];
    }
  }

  private writeHistory(): void {
    localStorage.setItem(this.storageKey, JSON.stringify(this.history.slice(0, this.maxHistory)));
  }
}
