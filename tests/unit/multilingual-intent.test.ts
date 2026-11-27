import { describe, expect, test } from "bun:test";
import { checkIntent, claimsLookup, forcedTool, weatherIntent } from "../../src/web-tools";

describe("multilingual intents (2026-11-27 German weather loop)", () => {
  test("German weather question → get_weather", () => {
    expect(forcedTool("Okay, und wie ist das Wetter morgen?")?.name).toBe("get_weather");
    expect(weatherIntent("Wie ist das Wetter in Zürich?")?.location).toBe("Zürich");
  });
  test("French / Spanish weather", () => {
    expect(weatherIntent("Quel temps fait-il à Lyon ?")?.location).toBe("Lyon");
    expect(weatherIntent("¿Qué tiempo hace en Madrid?")?.location).toBe("Madrid");
  });
  test("German check phrasing is soft", () => {
    expect(checkIntent("schau mal nach, ob der Laden offen hat")?.query).toBeTruthy();
    expect(forcedTool("prüf mal ob der Zug Verspätung hat")?.soft).toBe(true);
  });
  test("the logged English claims are detected", () => {
    expect(claimsLookup("I’m checking the weather in Zurich for tomorrow — just a moment.")).toBe(true);
    expect(claimsLookup("I'm still here — let me check the weather in Zurich for tomorrow.")).toBe(true);
    expect(claimsLookup("It’s 0 degrees Celsius in Zurich, overcast.")).toBe(false);
  });
  test("a claim's own text gives the place when the user named none", () => {
    expect(weatherIntent("I'll check the weather in Zurich for tomorrow right away.")?.location).toBe("Zurich");
  });
});
