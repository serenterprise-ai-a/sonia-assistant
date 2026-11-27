import { describe, expect, test } from "bun:test";
import { Player } from "../../src/audio/player";

// local patch (CHO-1423): the client buffers up to ~0.8 s of audio, so the server tells it
// to pause/resume together with its own player, and a flush never leaves it paused.
describe("Player pause/resume events", () => {
  test("pause and resume fire once each, duplicates are ignored", () => {
    const p = new Player(24000, "", 0, "callback");
    const ev: boolean[] = [];
    p.onPauseChange = (x) => ev.push(x);
    p.pause();
    p.pause();
    p.resume();
    p.resume();
    expect(ev).toEqual([true, false]);
  });
  test("flush while paused sends flush, then resume", () => {
    const p = new Player(24000, "", 0, "callback");
    const order: string[] = [];
    p.onFlush = () => order.push("flush");
    p.onPauseChange = (x) => order.push(x ? "pause" : "resume");
    p.pause();
    p.flush();
    expect(order).toEqual(["pause", "flush", "resume"]);
  });
  test("flush while playing sends no resume", () => {
    const p = new Player(24000, "", 0, "callback");
    const order: string[] = [];
    p.onFlush = () => order.push("flush");
    p.onPauseChange = (x) => order.push(x ? "pause" : "resume");
    p.flush();
    expect(order).toEqual(["flush"]);
  });
});
