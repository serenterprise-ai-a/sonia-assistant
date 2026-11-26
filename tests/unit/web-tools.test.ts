/**
 * Local patch (sr-zh-1, 2026-11-26): web_search (SearXNG), get_weather / set_user_location
 * (Open-Meteo) and the location in data/settings.json — all with a stubbed fetch, no network.
 */
import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_LOCATION, loadLocation, saveLocation } from "../../src/settings";
import { GATE_EXEMPT_TOOLS, SCHEMAS, Tools } from "../../src/tools";
import {
  forcedTool,
  geocode,
  getWeather,
  searchIntent,
  weatherIntent,
  weatherWords,
  webSearch,
} from "../../src/web-tools";

const json = (v: unknown) => new Response(JSON.stringify(v), { status: 200 });

const GEO = {
  results: [
    { name: "Altendorf", country: "Austria", country_code: "AT", timezone: "Europe/Vienna", latitude: 47.1, longitude: 15.9 },
    { name: "Altendorf", country: "Switzerland", country_code: "CH", admin1: "Schwyz", timezone: "Europe/Zurich", latitude: 47.19, longitude: 8.83 },
  ],
};
const FORECAST = {
  current: { time: "2026-11-26T13:30", temperature_2m: 33.3, apparent_temperature: 36.9, weather_code: 3, relative_humidity_2m: 44, wind_speed_10m: 7.2 },
  daily: { temperature_2m_max: [34.1], temperature_2m_min: [25.2], precipitation_probability_max: [20], weather_code: [80] },
};

describe("web_search", () => {
  test("top results: title, url, snippet; duplicates dropped; at most 5", async () => {
    let asked = "";
    const results = Array.from({ length: 8 }, (_, i) => ({ title: `T${i}`, url: `https://x/${i}`, content: `snippet ${i}` }));
    results.splice(1, 0, { title: "dup", url: "https://x/0", content: "" });
    const out = await webSearch("bangkok news", undefined, async (u) => {
      asked = u;
      return json({ results });
    });
    expect(asked).toContain("format=json");
    expect(asked).toContain("q=bangkok%20news");
    expect(out).toContain("1. T0 — https://x/0");
    expect(out).toContain("   snippet 0");
    expect(out).toContain("5. T4");
    expect(out).not.toContain("T5");
    expect(out).not.toContain("dup");
  });

  test("a dead SearXNG is a sentence, not a throw", async () => {
    const out = await webSearch("x", undefined, async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(out).toMatch(/not available/);
  });
});

describe("get_weather", () => {
  test("geocodes, picks the country from the hint, reports words for the WMO code", async () => {
    const urls: string[] = [];
    const out = await getWeather("Altendorf, Switzerland", DEFAULT_LOCATION, undefined, async (u) => {
      urls.push(u);
      return json(u.includes("geocoding") ? GEO : FORECAST);
    });
    expect(urls[1]).toContain("latitude=47.19");
    expect(out).toContain("Altendorf, Switzerland");
    expect(out).toContain("33 °C");
    expect(out).toContain("overcast");
    expect(out).toContain("high 34 °C, low 25 °C");
    expect(out).toContain("light rain showers");
    expect(out).toContain("chance of rain 20%");
  });

  test("no location → the saved one, no geocoding call", async () => {
    const urls: string[] = [];
    await getWeather("", DEFAULT_LOCATION, undefined, async (u) => {
      urls.push(u);
      return json(FORECAST);
    });
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain(`latitude=${DEFAULT_LOCATION.lat}`);
  });

  test("unknown place → says so", async () => {
    const out = await getWeather("Nowhereville", DEFAULT_LOCATION, undefined, async () => json({}));
    expect(out).toMatch(/no place called/);
  });

  test("WMO codes", () => {
    expect(weatherWords(0)).toBe("clear sky");
    expect(weatherWords(95)).toBe("thunderstorm");
    expect(weatherWords(42)).toBe("weather code 42");
  });

  test("geocode without hint takes the first match", async () => {
    const p = await geocode("Altendorf", undefined, async () => json(GEO));
    expect(p?.country).toBe("Austria");
  });
});

describe("user location in data/settings.json", () => {
  test("default Bangkok; save keeps the drawer's keys", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sonia-loc-"));
    const file = path.join(dir, "settings.json");
    expect(loadLocation(file)).toEqual(DEFAULT_LOCATION);
    fs.writeFileSync(file, JSON.stringify({ bargeIn: true }));
    saveLocation(file, { city: "Dubai", country: "United Arab Emirates", timezone: "Asia/Dubai", lat: 25.07, lon: 55.17 });
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    expect(raw.bargeIn).toBe(true);
    expect(loadLocation(file).city).toBe("Dubai");
    fs.writeFileSync(file, JSON.stringify({ location: { city: "X", timezone: "Not/AZone", lat: 1, lon: 2 } }));
    expect(loadLocation(file)).toEqual(DEFAULT_LOCATION); // unusable → default
  });

  test("get_datetime answers in the user's time zone", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sonia-loc-"));
    const tools = new Tools({ dataDir: dir, announce: () => {}, locale: "en" });
    const out = await tools.call("get_datetime", "{}");
    expect(out).toContain("Bangkok, Asia/Bangkok");
  });
});

describe("registration", () => {
  test("the new tools are offered, and the read-only ones skip the gate", () => {
    const names = SCHEMAS.map((s) => (s.function as { name: string }).name);
    for (const n of ["web_search", "get_weather", "set_user_location"]) expect(names).toContain(n);
    expect(GATE_EXEMPT_TOOLS.has("web_search")).toBe(true);
    expect(GATE_EXEMPT_TOOLS.has("get_weather")).toBe(true);
    expect(GATE_EXEMPT_TOOLS.has("set_user_location")).toBe(false);
  });
});

describe("weatherIntent (the get_weather safety net)", () => {
  test("weather questions, with and without a place", () => {
    expect(weatherIntent("what's the weather like?")).toEqual({});
    expect(weatherIntent("Can you check for the weather in Bangkok?")).toEqual({ location: "Bangkok" });
    expect(weatherIntent("how hot is it in Dubai today?")).toEqual({ location: "Dubai" });
    expect(weatherIntent("is it going to rain tomorrow")).toEqual({});
    expect(weatherIntent("che tempo fa a Zurigo?")).toEqual({ location: "Zurigo" });
  });
  test("not weather", () => {
    expect(weatherIntent("tell me a story about the rain")).toBeNull();
    expect(weatherIntent("search the web for Thai news")).toBeNull();
    expect(weatherIntent("what time is it?")).toBeNull();
  });
});

describe("searchIntent / forcedTool", () => {
  test("explicit search requests → the query", () => {
    expect(searchIntent("search the web for the latest news about the Bangkok BTS skytrain")).toEqual({
      query: "the latest news about the Bangkok BTS skytrain",
    });
    expect(searchIntent("Look up the opening hours of the Grand Palace.")).toEqual({
      query: "the opening hours of the Grand Palace",
    });
    expect(searchIntent("google Altendorf property prices")).toEqual({ query: "Altendorf property prices" });
    expect(searchIntent("tell me a story")).toBeNull();
  });
  test("search wins over weather; weather alone → get_weather", () => {
    expect(forcedTool("search the web for weather records in Dubai")?.name).toBe("web_search");
    expect(forcedTool("what's the weather like?")).toEqual({ name: "get_weather", args: {} });
    expect(forcedTool("hello")).toBeNull();
  });
});
