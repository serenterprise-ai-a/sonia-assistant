import { describe, expect, test } from "bun:test";
import { browseUrl, checkPublicUrl, htmlToText, isPrivateIp } from "../../src/web-tools";

const pub = async () => ["93.184.216.34"];
const priv = async () => ["192.168.8.1"];

function res(body: string, init: { status?: number; type?: string; location?: string } = {}): Response {
  const h = new Headers({ "content-type": init.type ?? "text/html; charset=utf-8" });
  if (init.location) h.set("location", init.location);
  return new Response(body, { status: init.status ?? 200, headers: h });
}
const page = `<html><head><title>News &amp; more</title><script>x()</script><style>p{}</style></head>
<body><nav>menu</nav><h1>Big story</h1><p>${"Something important happened today in the city. ".repeat(5)}</p></body></html>`;

describe("isPrivateIp", () => {
  test("blocks loopback, LAN, link-local, CGNAT/Tailscale", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.8.1", "169.254.1.1", "100.74.85.101", "::1", "fd7a:115c::1", "::ffff:192.168.1.1", "0.0.0.0"])
      expect(isPrivateIp(ip)).toBe(true);
  });
  test("allows public addresses", () => {
    for (const ip of ["93.184.216.34", "8.8.8.8", "100.128.0.1", "2606:4700::1111"]) expect(isPrivateIp(ip)).toBe(false);
  });
});

describe("checkPublicUrl", () => {
  test("adds https to a bare host", async () => {
    const u = await checkPublicUrl("example.com/a", pub);
    expect(typeof u === "string" ? u : u.toString()).toBe("https://example.com/a");
  });
  test("refuses other schemes, localhost, ts.net and private DNS answers", async () => {
    expect(await checkPublicUrl("file:///etc/passwd", pub)).toBeTypeOf("string");
    expect(await checkPublicUrl("http://localhost:8888", pub)).toBeTypeOf("string");
    expect(await checkPublicUrl("https://sr-zh-1.tail0.ts.net", pub)).toBeTypeOf("string");
    expect(await checkPublicUrl("http://router.example", priv)).toBeTypeOf("string");
    expect(await checkPublicUrl("http://192.168.8.1/", pub)).toBeTypeOf("string");
  });
});

describe("htmlToText", () => {
  test("keeps the text, drops scripts/styles/nav, decodes entities", () => {
    const { title, text } = htmlToText(page);
    expect(title).toBe("News & more");
    expect(text).toContain("Big story");
    expect(text).not.toContain("x()");
    expect(text).not.toContain("menu");
  });
});

describe("browseUrl", () => {
  test("returns the page text with its title", async () => {
    const out = await browseUrl("https://example.com", undefined, async () => res(page), pub);
    expect(out).toContain("«News & more»");
    expect(out).toContain("Something important happened");
  });
  test("re-checks redirects and refuses a hop to a private address", async () => {
    const f = async () => res("", { status: 302, location: "http://192.168.8.1/admin" });
    expect(await browseUrl("https://example.com", undefined, f, pub)).toContain("refused");
  });
  test("refuses a private target without fetching", async () => {
    let called = false;
    const out = await browseUrl("http://127.0.0.1:8888", undefined, async () => { called = true; return res(page); }, pub);
    expect(out).toContain("refused");
    expect(called).toBe(false);
  });
  test("HTTP errors and non-text are sentences, not throws", async () => {
    expect(await browseUrl("https://example.com", undefined, async () => res("no", { status: 403 }), pub)).toContain("HTTP 403");
    expect(await browseUrl("https://example.com/a.pdf", undefined, async () => res("%PDF", { type: "application/pdf" }), pub)).toContain("not a readable page");
  });
  test("near-empty pages point to web_search", async () => {
    expect(await browseUrl("https://example.com", undefined, async () => res("<div id=app></div>"), pub)).toContain("web_search");
  });
});
