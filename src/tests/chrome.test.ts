import "fake-indexeddb/auto";
import { expect, it, vi } from "vitest";
const event = () => ({ addListener: vi.fn() });
it("integrates Chrome listeners, consent, focus, idle, navigation, exclusion and deletion", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  const base = Date.parse("2026-01-01T12:00:00Z");
  vi.setSystemTime(base);
  const stored: Record<string, unknown> = {};
  let focused = true;
  let idle = "active";
  let tab = {
    id: 1,
    windowId: 1,
    incognito: false,
    url: "https://example.com/private?secret=token",
    active: true,
  };
  const api = {
    tabs: {
      onActivated: event(),
      onUpdated: event(),
      onRemoved: event(),
      query: vi.fn(async () => [tab]),
    },
    windows: {
      onFocusChanged: event(),
      getAll: vi.fn(async () => [{ id: 1, focused, incognito: false }]),
      WINDOW_ID_NONE: -1,
    },
    idle: {
      onStateChanged: event(),
      setDetectionInterval: vi.fn(),
      queryState: vi.fn(async () => idle),
    },
    runtime: {
      onStartup: event(),
      onInstalled: event(),
      onMessage: event(),
      id: "test",
      getURL: (s: string) => "chrome-extension://test/" + s,
    },
    alarms: { onAlarm: event(), create: vi.fn(async () => {}) },
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: stored[key] })),
        set: vi.fn(async (data: object) => {
          Object.assign(stored, data);
        }),
        setAccessLevel: vi.fn(async () => {}),
      },
    },
  };
  vi.stubGlobal("chrome", api);
  await import("../background/index");
  for (const e of [
    api.tabs.onActivated,
    api.tabs.onUpdated,
    api.tabs.onRemoved,
    api.windows.onFocusChanged,
    api.idle.onStateChanged,
    api.runtime.onStartup,
    api.runtime.onInstalled,
    api.alarms.onAlarm,
  ])
    expect(e.addListener).toHaveBeenCalledOnce();
  const { enqueue, command } = await import("../background/event-handlers");
  const { db } = await import("../database/db");
  const drain = () => enqueue(async () => {});
  const fire = (
    e: ReturnType<typeof event>,
    seconds: number,
    ...args: unknown[]
  ) => {
    vi.setSystemTime(base + seconds * 1000);
    e.addListener.mock.calls[0][0](...args);
    return drain();
  };
  await drain();
  expect(await db.visits.count()).toBe(0);
  expect(api.alarms.create).toHaveBeenCalledWith("checkpoint", {
    periodInMinutes: 0.5,
  });
  expect(api.idle.setDetectionInterval).toHaveBeenCalledWith(60);
  await enqueue(() => command({ type: "toggle", enabled: true }));
  expect(await db.visits.count()).toBe(1);
  await fire(api.alarms.onAlarm, 10, { name: "checkpoint" });
  focused = false;
  await fire(api.windows.onFocusChanged, 15, -1);
  focused = true;
  await fire(api.windows.onFocusChanged, 30, 1);
  idle = "locked";
  await fire(api.idle.onStateChanged, 35, "locked");
  idle = "active";
  await fire(api.idle.onStateChanged, 50, "active");
  tab = { ...tab, url: "https://example.com/second?token=another" };
  await fire(api.tabs.onUpdated, 55, 1, { url: tab.url });
  await fire(api.tabs.onUpdated, 55, 1, { url: tab.url });
  expect(await db.visits.count()).toBe(4);
  tab = { ...tab, id: 2, url: "https://other.test" };
  await fire(api.tabs.onActivated, 60, { tabId: 2, windowId: 1 });
  await fire(api.tabs.onRemoved, 65, 2);
  expect((await db.sessions.toArray())[0].totalActiveMs).toBe(35000);
  expect(
    (await db.visits.toArray()).every(
      (v) => !v.url.includes("token") && !v.title.includes("private"),
    ),
  ).toBe(true);
  await enqueue(() => command({ type: "exclude", domains: ["other.test"] }));
  expect(
    (await db.visits.toArray()).filter((v) => v.status === "active"),
  ).toHaveLength(0);
  await expect(command({ type: "toggle", enabled: "yes" })).rejects.toThrow();
  await expect(
    command({ type: "exclude", domains: ["https://invalid/path"] }),
  ).rejects.toThrow();
  const listener = api.runtime.onMessage.addListener.mock.calls[0][0];
  expect(listener({ type: "clear" }, { id: "external" }, vi.fn())).toBe(false);
  expect(
    listener(
      { type: "clear" },
      { id: "test", url: "https://example.com" },
      vi.fn(),
    ),
  ).toBe(false);
  await enqueue(() => command({ type: "clear" }));
  expect(await db.visits.count()).toBe(0);
  expect(stored.checkpoint).toBeNull();
  expect((stored.settings as { enabled: boolean }).enabled).toBe(false);
  await db.delete();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
