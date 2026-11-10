import Dexie, { type Table } from "dexie";
import type { Visit, BrowsingSession, Checkpoint } from "../domain/types";
export class BrowseDatabase extends Dexie {
  visits!: Table<Visit, string>;
  sessions!: Table<BrowsingSession, string>;
  checkpoints!: Table<Checkpoint, string>;
  constructor(name = "BrowseMind") {
    super(name);
    this.version(1).stores({
      visits: "id,sessionId,startedAt,domain",
      sessions: "id,startedAt",
      checkpoints: "id",
    });
  }
}
export const db = new BrowseDatabase();
