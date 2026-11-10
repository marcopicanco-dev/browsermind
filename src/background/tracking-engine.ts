import type { BrowseDatabase } from "../database/db";
import type {
  Candidate,
  Checkpoint,
  TrackingSettings,
  Visit,
} from "../domain/types";
import { elapsed, MAX_OBSERVED_GAP_MS } from "../domain/time-calculator";
const iso = (t: number) => new Date(t).toISOString();
export class TrackingEngine {
  private queue: Promise<unknown> = Promise.resolve();
  private initialized = false;
  constructor(
    private db: BrowseDatabase,
    private mirror: (
      checkpoint: Checkpoint | null,
    ) => Promise<void> = async () => {},
  ) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.catch(() => {});
    return result;
  }
  reconcile(
    next: Candidate | null,
    at: number,
    settings: TrackingSettings,
    restart = false,
    forceBoundary = false,
  ) {
    return this.serial(async () => {
      let checkpoint: Checkpoint | undefined;
      await this.db.transaction(
        "rw",
        this.db.visits,
        this.db.sessions,
        this.db.checkpoints,
        async () => {
          const cp = (await this.db.checkpoints.get("tracking")) ?? {
            id: "tracking" as const,
            visitId: null,
            sessionId: null,
            lastAt: at,
            lastActivityAt: at,
            periodId: null,
          };
          const recovering = !this.initialized || restart;
          const time = Math.max(at, cp.lastAt);
          const previous: Visit | undefined = cp.visitId
            ? await this.db.visits.get(cp.visitId)
            : undefined;
          const eligible = settings.enabled ? next : null;
          const gap = time - cp.lastAt;
          const unknown = recovering || gap > MAX_OBSERVED_GAP_MS;
          if (previous) {
            if (!unknown) {
              const duration = elapsed(cp.lastAt, time);
              previous.activeDurationMs += duration;
              await this.db.sessions.update(previous.sessionId, {
                totalActiveMs:
                  ((await this.db.sessions.get(previous.sessionId))
                    ?.totalActiveMs ?? 0) + duration,
              });
              cp.lastActivityAt = time;
            }
            const same =
              eligible &&
              previous.tabId === eligible.tabId &&
              previous.windowId === eligible.windowId &&
              previous.url === eligible.url;
            if (unknown || !same || forceBoundary) {
              previous.endedAt = iso(unknown ? cp.lastAt : time);
              previous.status = unknown ? "interrupted" : "completed";
              cp.visitId = null;
              cp.periodId = null;
            }
            await this.db.visits.put(previous);
          }
          if (
            cp.sessionId &&
            (time - cp.lastActivityAt >=
              settings.sessionTimeoutMinutes * 60_000 ||
              restart)
          ) {
            await this.db.sessions.update(cp.sessionId, {
              endedAt: iso(cp.lastActivityAt),
              status: "completed",
            });
            cp.sessionId = null;
          }
          if (eligible && !cp.visitId) {
            if (!cp.sessionId) {
              cp.sessionId = crypto.randomUUID();
              await this.db.sessions.add({
                id: cp.sessionId,
                startedAt: iso(time),
                endedAt: null,
                totalActiveMs: 0,
                visitCount: 0,
                status: "active",
              });
            }
            cp.visitId = crypto.randomUUID();
            cp.periodId = crypto.randomUUID();
            await this.db.visits.add({
              ...eligible,
              id: cp.visitId,
              sessionId: cp.sessionId,
              startedAt: iso(time),
              endedAt: null,
              activeDurationMs: 0,
              status: "active",
            });
            const session = (await this.db.sessions.get(cp.sessionId))!;
            await this.db.sessions.update(cp.sessionId, {
              visitCount: session.visitCount + 1,
            });
            cp.lastActivityAt = time;
          }
          cp.lastAt = time;
          await this.db.checkpoints.put(cp);
          checkpoint = cp;
        },
      );
      this.initialized = true;
      // IndexedDB is authoritative. A failed mirror cannot cause double counting on recovery.
      await this.mirror(checkpoint!);
    });
  }
  clear() {
    return this.serial(async () => {
      await this.db.transaction(
        "rw",
        this.db.visits,
        this.db.sessions,
        this.db.checkpoints,
        async () => {
          await this.db.visits.clear();
          await this.db.sessions.clear();
          await this.db.checkpoints.clear();
        },
      );
      this.initialized = true;
      await this.mirror(null);
    });
  }
}
