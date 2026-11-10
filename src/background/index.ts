import { command, enqueue, initialize, reconcile } from "./event-handlers";
// Registration must stay synchronous at module scope for MV3 wake-up events.
const dispatch = (options: Parameters<typeof reconcile>[0] = {}) => {
  void enqueue(() => reconcile(options)).catch(() => {});
};
chrome.tabs.onActivated.addListener(() => dispatch());
// Only ephemeral SHA-256 digests are retained for duplicate URL notifications.
const lastUrls = new Map<number, string>();
chrome.tabs.onUpdated.addListener((tabId, change) => {
  if (change.url !== undefined) {
    const raw = change.url;
    void enqueue(async () => {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(raw),
      );
      const key = Array.from(new Uint8Array(digest)).join(",");
      if (lastUrls.get(tabId) === key) return;
      lastUrls.set(tabId, key);
      await reconcile({ changedTab: tabId });
    }).catch(() => {});
  } else if (change.status === "complete") dispatch();
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void enqueue(async () => {
    lastUrls.delete(tabId);
    await reconcile({ removedTab: tabId });
  }).catch(() => {});
});
chrome.windows.onFocusChanged.addListener((id) =>
  dispatch({ stop: id === chrome.windows.WINDOW_ID_NONE }),
);
chrome.idle.onStateChanged.addListener((state) =>
  dispatch({ stop: state !== "active" }),
);
chrome.runtime.onStartup.addListener(() => dispatch({ restart: true }));
chrome.runtime.onInstalled.addListener(() => dispatch({ restart: true }));
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "checkpoint") dispatch();
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (
    sender.id !== chrome.runtime.id ||
    sender.url !== chrome.runtime.getURL("popup.html")
  )
    return false;
  void enqueue(() => command(message)).then(
    (data) => respond({ ok: true, data }),
    () =>
      respond({
        ok: false,
        error:
          "Não foi possível acessar os dados locais ou validar a configuração.",
      }),
  );
  return true;
});
void enqueue(async () => {
  await initialize();
  await reconcile();
}).catch(() => {});
