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
