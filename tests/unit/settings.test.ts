/**
 * `data/settings.json` — the drawer's runtime switches (half-duplex, barge-in, the two
 * mode selects, the pi/API leg, thinking) surviving a restart.
 *
 * The failure this pins: the drawer used to write into the live `Config` and nothing
 * persisted it, so every restart snapped the user's choices back to `.env`. The store is
 * also deliberately forgiving — a missing, torn or hand-edited file yields no overrides,
 * never a startup crash.
 */
import { afterAll, describe, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Config, parseAsrLanguage } from "../../src/config";
import { captureSettings, SettingsStore } from "../../src/settings";

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

function store(): SettingsStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-settings-"));
  dirs.push(dir);
  return new SettingsStore(path.join(dir, "settings.json"));
}

describe("SettingsStore", () => {
  test("a saved snapshot is applied on the next start", () => {
    const s = store();
    const a = Config.fromEnv();
    a.halfDuplex = true;
    a.bargeIn = false;
    a.decisionMode = "always";
    a.cmdMode = "ask";
    a.llmViaPi = true;
    a.llmDisableThinking = false;
    s.save(a);

    const b = Config.fromEnv();
    // start from the opposite of every one of them, then let the store have its say
    b.halfDuplex = false;
    b.bargeIn = true;
    b.decisionMode = "off";
    b.cmdMode = "off";
    b.llmViaPi = false;
    b.llmDisableThinking = true;
    s.apply(b);

    expect(captureSettings(b)).toEqual({
      halfDuplex: true,
      bargeIn: false,
      decisionMode: "always",
      cmdMode: "ask",
      llmViaPi: true,
      llmDisableThinking: false,
      asrLanguage: "",
    });
  });

  test("no file yet: no overrides, and the Config is left as it was", () => {
    const s = store();
    expect(s.load()).toEqual({});
    const cfg = Config.fromEnv();
    const before = captureSettings(cfg);
    s.apply(cfg);
    expect(captureSettings(cfg)).toEqual(before);
  });

  test("torn / hand-edited / wrong-typed file: the bad parts are dropped, not thrown", () => {
    const s = store();
    fs.mkdirSync(path.dirname(s.file), { recursive: true });
    fs.writeFileSync(s.file, JSON.stringify({ halfDuplex: "yes", bargeIn: true, junk: 1 }));
    expect(s.load()).toEqual({ bargeIn: true });

    fs.writeFileSync(s.file, "{ not json");
    expect(s.load()).toEqual({});

    fs.writeFileSync(s.file, "null");
    expect(s.load()).toEqual({});
  });

  test("the stored modes are normalised, so a junk one lands on the safe default", () => {
    const s = store();
    fs.mkdirSync(path.dirname(s.file), { recursive: true });
    fs.writeFileSync(s.file, JSON.stringify({ cmdMode: "Ask2", decisionMode: "sometimes" }));
    expect(s.load()).toEqual({ cmdMode: "ask", decisionMode: "auto" });
  });

  test("a failed write costs the persistence, never the session", () => {
    // a directory that cannot exist (a file sits where the dir should be)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fd-settings-"));
    dirs.push(dir);
    const blocked = path.join(dir, "not-a-dir");
    fs.writeFileSync(blocked, "x");
    const s = new SettingsStore(path.join(blocked, "settings.json"));
    const cfg = Config.fromEnv();
    cfg.bargeIn = false;
    expect(() => s.save(cfg)).not.toThrow();
  });
});

describe("asr language", () => {
  test("parseAsrLanguage accepts the allowed set and rejects the rest", () => {
    for (const v of ["", "en", "de", "fr", "it", "es"])
      expect(parseAsrLanguage(v)).toBe(v as never);
    expect(parseAsrLanguage("DE")).toBe("de");
    expect(parseAsrLanguage(" en ")).toBe("en");
    for (const v of ["xx", "th", "ja", 42, null, undefined]) expect(parseAsrLanguage(v)).toBeNull();
  });

  test("ASR_LANGUAGE env: junk warns and falls back to auto, valid passes", () => {
    const prev = process.env.ASR_LANGUAGE;
    try {
      const logs: string[] = [];
      process.env.ASR_LANGUAGE = "th";
      expect(Config.fromEnv((m) => logs.push(m)).asrLanguage).toBe("");
      expect(logs.some((l) => l.includes("ASR_LANGUAGE=th"))).toBe(true);
      process.env.ASR_LANGUAGE = "DE";
      expect(Config.fromEnv(() => {}).asrLanguage).toBe("de");
    } finally {
      if (prev === undefined) delete process.env.ASR_LANGUAGE;
      else process.env.ASR_LANGUAGE = prev;
    }
  });

  test("persisted, restored, invalid stored value ignored, other keys kept", () => {
    const s = store();
    fs.writeFileSync(s.file, JSON.stringify({ location: { city: "X" }, userNote: "n" }));
    const a = Config.fromEnv();
    a.asrLanguage = "de";
    s.save(a);
    const raw = JSON.parse(fs.readFileSync(s.file, "utf-8"));
    expect(raw.asrLanguage).toBe("de");
    expect(raw.location).toEqual({ city: "X" });
    expect(raw.userNote).toBe("n");
    const b = Config.fromEnv();
    s.apply(b);
    expect(b.asrLanguage).toBe("de");

    fs.writeFileSync(s.file, JSON.stringify({ asrLanguage: "klingon" }));
    expect(s.load().asrLanguage).toBeUndefined();
    const c = Config.fromEnv();
    c.asrLanguage = "fr"; // the .env value stays when the stored one is junk
    s.apply(c);
    expect(c.asrLanguage).toBe("fr");
  });
});
