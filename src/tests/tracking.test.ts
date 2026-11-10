import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowseDatabase } from "../database/db";
import { TrackingEngine } from "../background/tracking-engine";
import { defaults, type Candidate } from "../domain/types";
import { sanitizeUrl, candidate } from "../shared/url-utils";
import { elapsed, todaySummary } from "../domain/time-calculator";
const config = { ...defaults, enabled: true };
const a: Candidate = {
  tabId: 1,
  windowId: 1,
  domain: "example.com",
  url: "https://example.com/",
  title: "example.com",
};
const b = {
  ...a,
  tabId: 2,
  domain: "other.test",
  url: "https://other.test/",
  title: "other.test",
};
let db: BrowseDatabase;
let engine: TrackingEngine;
const base = Date.parse("2026-01-01T12:00:00Z");
const tick = async (
  next: Candidate | null,
  seconds: number,
  restart = false,
  changed = false,
) => {
  vi.setSystemTime(base + seconds * 1000);
  await engine.reconcile(next, Date.now(), config, restart, changed);
};
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  db = new BrowseDatabase(crypto.randomUUID());
  engine = new TrackingEngine(db);
});
afterEach(async () => {
  await db.delete();
  vi.useRealTimers();
});
describe("privacy", () => {
  it.each([
    "https://example.com/path?token=secret#private",
    "http://example.com/",
  ])("accepts and sanitizes %s", (raw) => {
    expect(sanitizeUrl(raw)).toEqual({
      domain: "example.com",
      url: new URL(raw).origin + "/",
      title: "example.com",
    });
  });
  it.each([
    "chrome://settings",
    "edge://settings",
    "about:blank",
    "file:///secret",
    "data:text/plain,hi",
    "chrome-extension://abc/x",
    "invalid",
    "https://user:password@example.com",
  ])("rejects %s", (raw) => expect(sanitizeUrl(raw)).toBeNull());
  it("excludes exact domains and subdomains without excluding lookalikes", () => {
    expect(sanitizeUrl("https://sub.example.com", ["example.com"])).toBeNull();
    expect(
      sanitizeUrl("https://notexample.com", ["example.com"]),
    ).not.toBeNull();
  });
  it("rejects incognito and missing URLs", () => {
    expect(candidate({ incognito: true } as chrome.tabs.Tab, [])).toBeNull();
    expect(
      candidate({ id: 1, incognito: false } as chrome.tabs.Tab, []),
    ).toBeNull();
  });
  it("is disabled by default", async () => {
    await engine.reconcile(a, base, defaults);
    expect(await db.visits.count()).toBe(0);
  });
});
describe("transactional tracking", () => {
  it("switches tabs without overlapping time", async () => {
    await tick(a, 0);
    await tick(b, 10);
    await tick(null, 20);
    const visits = await db.visits.toArray();
    expect(visits.map((v) => v.activeDurationMs).sort()).toEqual([
      10000, 10000,
    ]);
    expect((await db.sessions.toArray())[0].totalActiveMs).toBe(20000);
  });
  it("switches windows", async () => {
    await tick(a, 0);
    await tick({ ...a, windowId: 2 }, 5);
    await tick(null, 10);
    expect(await db.visits.count()).toBe(2);
    expect((await db.sessions.toArray())[0].totalActiveMs).toBe(10000);
  });
  it.each(["focus loss", "idle", "locked", "active tab closed"])(
    "stops on %s and resumes without counting absence",
    async () => {
      await tick(a, 0);
      await tick(null, 5);
      await tick(a, 100);
      await tick(null, 110);
      expect((await db.sessions.toArray())[0].totalActiveMs).toBe(15000);
    },
  );
  it("splits same-tab URL changes even within the same origin", async () => {
    await tick(a, 0);
    await tick(a, 10, false, true);
    await tick(null, 20);
    expect(await db.visits.count()).toBe(2);
    expect((await db.sessions.toArray())[0].totalActiveMs).toBe(20000);
  });
  it("separates sessions after timeout without crediting timeout", async () => {
    await tick(a, 0);
    await tick(null, 10);
    await tick(b, 1220);
    const sessions = await db.sessions.toArray();
    expect(sessions).toHaveLength(2);
    expect(sessions.find((s) => s.status === "completed")?.totalActiveMs).toBe(
      10000,
    );
  });
  it("recovers worker from checkpoint without crediting unobserved gap", async () => {
    await tick(a, 0);
    await tick(a, 10);
    engine = new TrackingEngine(db);
    await tick(a, 40);
    await tick(null, 45);
    const visits = await db.visits.toArray();
    expect(
      visits.find((v) => v.status === "interrupted")?.activeDurationMs,
    ).toBe(10000);
    expect((await db.sessions.toArray())[0].totalActiveMs).toBe(15000);
  });
  it("reopens durable database after browser close", async () => {
    await tick(a, 0);
    await tick(a, 10);
    const name = db.name;
    db.close();
    db = new BrowseDatabase(name);
    engine = new TrackingEngine(db);
    await tick(a, 10000, true);
    expect(
      (await db.visits.toArray()).find((v) => v.status === "interrupted")
        ?.endedAt,
    ).toBe(new Date(base + 10000).toISOString());
    expect(await db.sessions.count()).toBe(2);
  });
  it("discards long suspension even in same worker", async () => {
    await tick(a, 0);
    await tick(a, 10);
    await tick(a, 300);
    await tick(null, 310);
    expect((await db.sessions.toArray())[0].totalActiveMs).toBe(20000);
  });
  it("serializes concurrent duplicate events", async () => {
    await tick(a, 0);
    await Promise.all(
      Array.from({ length: 10 }, () =>
        engine.reconcile(a, base + 10000, config),
      ),
    );
    expect(await db.visits.count()).toBe(1);
    expect((await db.sessions.toArray())[0].totalActiveMs).toBe(10000);
  });
  it("does not generate negative durations on clock rollback", async () => {
    await tick(a, 10);
    await tick(a, 5);
    await tick(null, 15);
    expect((await db.sessions.toArray())[0].totalActiveMs).toBe(5000);
    expect(elapsed(10, 5)).toBe(0);
  });
  it("clears visits, sessions, checkpoints and mirror", async () => {
    const mirror = vi.fn(async () => {});
    engine = new TrackingEngine(db, mirror);
    await tick(a, 0);
    await engine.clear();
    expect(await db.visits.count()).toBe(0);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.checkpoints.count()).toBe(0);
    expect(mirror).toHaveBeenLastCalledWith(null);
  });
  it("uses canonical DB when checkpoint mirror fails", async () => {
    engine = new TrackingEngine(db, async () => {
      throw Error("storage");
    });
    await expect(tick(a, 0)).rejects.toThrow();
    await expect(tick(a, 10)).rejects.toThrow();
    engine = new TrackingEngine(db);
    await tick(a, 20);
    expect((await db.sessions.toArray())[0].totalActiveMs).toBe(10000);
  });
  it("rolls back visit and session together on transaction failure", async () => {
    const spy = vi
      .spyOn(db.sessions, "add")
      .mockRejectedValueOnce(Error("disk"));
    await expect(tick(a, 0)).rejects.toThrow("disk");
    expect(await db.visits.count()).toBe(0);
    expect(await db.checkpoints.count()).toBe(0);
    spy.mockRestore();
    await tick(a, 1);
    expect(await db.visits.count()).toBe(1);
  });
  it("splits today at local midnight with half-open duration", async () => {
    const midnight = new Date(2026, 1, 2).getTime();
    await engine.reconcile(a, midnight - 10000, config);
    await engine.reconcile(null, midnight + 10000, config);
    const visits = await db.visits.toArray();
    expect(todaySummary(visits, new Date(midnight + 20000)).activeMs).toBe(
      10000,
    );
    expect(todaySummary(visits, new Date(midnight - 1)).activeMs).toBe(9999);
    expect(todaySummary(visits, new Date(midnight + 20000)).visitCount).toBe(0);
  });
});
