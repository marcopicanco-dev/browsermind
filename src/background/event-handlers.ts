import { db } from "../database/db";
import { defaults, type TrackingSettings } from "../domain/types";
import { candidate } from "../shared/url-utils";
import { TrackingEngine } from "./tracking-engine";
export const engine = new TrackingEngine(db, async (checkpoint) => {
  await chrome.storage.local.set({ checkpoint });
});
let queue: Promise<unknown> = Promise.resolve();
export function enqueue<T>(task: () => Promise<T>) {
  const result = queue.then(task);
  queue = result.catch(() => {
    console.error("BrowseMind: falha no armazenamento ou na API do navegador.");
  });
  return result;
}
export async function settings(): Promise<TrackingSettings> {
  const data = await chrome.storage.local.get("settings");
  const saved = data.settings as Partial<TrackingSettings> | undefined;
  return {
    enabled: saved?.enabled === true,
    idleThresholdSeconds:
      typeof saved?.idleThresholdSeconds === "number" &&
      Number.isInteger(saved.idleThresholdSeconds) &&
      saved.idleThresholdSeconds >= 60
        ? saved.idleThresholdSeconds
        : defaults.idleThresholdSeconds,
    sessionTimeoutMinutes:
      typeof saved?.sessionTimeoutMinutes === "number" &&
      Number.isFinite(saved.sessionTimeoutMinutes) &&
      saved.sessionTimeoutMinutes > 0
        ? saved.sessionTimeoutMinutes
        : defaults.sessionTimeoutMinutes,
    excludedDomains: Array.isArray(saved?.excludedDomains)
      ? saved.excludedDomains
          .filter((d): d is string => typeof d === "string")
          .map((d) => d.trim().toLowerCase())
          .filter(Boolean)
      : [],
  };
}
export async function reconcile(
  options: {
    stop?: boolean;
    restart?: boolean;
    changedTab?: number;
    removedTab?: number;
  } = {},
) {
  const config = await settings();
  chrome.idle.setDetectionInterval(config.idleThresholdSeconds);
  let current = null;
  if (config.enabled && !options.stop) {
    const state = await chrome.idle.queryState(config.idleThresholdSeconds);
    const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
    const focused = windows.find((w) => w.focused && !w.incognito);
    if (state === "active" && focused?.id !== undefined) {
      const [tab] = await chrome.tabs.query({
        active: true,
        windowId: focused.id,
      });
      if (tab && tab.id !== options.removedTab)
        current = candidate(tab, config.excludedDomains);
    }
  }
  await engine.reconcile(
    current,
    Date.now(),
    config,
    options.restart,
    current !== null && options.changedTab === current.tabId,
  );
}
export async function initialize() {
  await chrome.storage.local.setAccessLevel({
    accessLevel: "TRUSTED_CONTEXTS",
  });
  await chrome.alarms.create("checkpoint", { periodInMinutes: 0.5 });
}
export async function command(message: unknown) {
  if (!message || typeof message !== "object" || !("type" in message))
    throw new Error("Comando inválido");
  const m = message as { type: string; enabled?: unknown; domains?: unknown };
  if (m.type === "toggle") {
    if (typeof m.enabled !== "boolean")
      throw new Error("Configuração inválida");
    await reconcile({ stop: true });
    await chrome.storage.local.set({
      settings: { ...(await settings()), enabled: m.enabled },
    });
    await reconcile();
  } else if (m.type === "exclude") {
    if (
      !Array.isArray(m.domains) ||
      !m.domains.every(
        (d) =>
          typeof d === "string" &&
          /^(?=.{1,253}$)[a-z0-9]+(?:[a-z0-9.-]*[a-z0-9])?$/.test(d),
      )
    )
      throw new Error("Informe domínios válidos, sem protocolo ou caminho.");
    await reconcile({ stop: true });
    await chrome.storage.local.set({
      settings: {
        ...(await settings()),
        excludedDomains: [...new Set(m.domains)],
      },
    });
    await reconcile();
  } else if (m.type === "clear") {
    await chrome.storage.local.set({
      settings: { ...(await settings()), enabled: false },
    });
    await engine.clear();
  } else if (m.type !== "snapshot") throw new Error("Comando inválido");
  return {
    settings: await settings(),
    visits: await db.visits.orderBy("startedAt").reverse().toArray(),
  };
}
