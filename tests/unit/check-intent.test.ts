import { describe, expect, test } from "bun:test";
import { checkIntent, forcedTool } from "../../src/web-tools";

describe("checkIntent / forcedTool (check for …)", () => {
  test("the logged request becomes a web_search", () => {
    const f = forcedTool(
      "Can you hear me now? Okay, I was saying, I didn't mention anything about the remodel. I was just saying, you should check for Black Friday sale for Index Living Mall in Thailand.",
    );
    expect(f?.name).toBe("web_search");
    expect(f?.args.query).toBe("Black Friday sale for Index Living Mall in Thailand");
  });
  test("find out whether / controlla se", () => {
    expect(checkIntent("find out whether the BTS runs late tonight")?.query).toBe("BTS runs late tonight");
    expect(checkIntent("controlla se il museo è aperto")?.query).toBe("il museo è aperto");
  });
  test("a weather question still goes to get_weather", () => {
    expect(forcedTool("check the weather in Lisbon")?.name).toBe("get_weather");
  });
  test("no check verb → nothing", () => {
    expect(checkIntent("I like checking in early")).toBeNull();
    expect(forcedTool("tell me a story")).toBeNull();
  });
});

import { claimsLookup } from "../../src/web-tools";

describe("soft check intent (2026-11-27 04:59 false positive)", () => {
  test("'why did you check for …' is soft and the real answer does not claim a lookup", () => {
    const f = forcedTool("My question was, why did you check for these specific stores and not others? decision-making process behind that.");
    expect(f?.soft).toBe(true);
    expect(claimsLookup("I chose major, reputable online retailers with clear pricing, delivery options.")).toBe(false);
  });
  test("an empty promise does claim a lookup", () => {
    expect(claimsLookup("I'll check the Black Friday sale at Index Living Mall right away.")).toBe(true);
    expect(claimsLookup("Let me search for that.")).toBe(true);
  });
  test("explicit search and weather stay hard", () => {
    expect(forcedTool("search the web for Lisbon tram strikes")?.soft).toBeUndefined();
    expect(forcedTool("check the weather in Lisbon")?.soft).toBeUndefined();
  });
});
