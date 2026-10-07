import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, ref, get, update, push, onValue, serverTimestamp, type Database } from 'firebase/database';
import { FIREBASE_CONFIG, PLAYER_KEY, PARTY_DOC, RTDB_PARTY_ROOT, FS_CACHE_KEY } from './firebase.config';
import type { PlayerFichaPublic, PlayerEventType } from '@state/contracts';
import type { PlayerStateSource } from '@state/mappers';
import { toPlayerDoc } from '@state/mappers';
import type { StateBackend } from '@state/gateway';

export class RtdbStateBackend implements StateBackend {
  private readonly db: Database;
  private readonly playerPath: string;
  private readonly eventsPath: string;

  constructor() {
    const app: FirebaseApp = initializeApp(FIREBASE_CONFIG, 'wow-rpg-player');
    this.db = getDatabase(app);
    this.playerPath = `${RTDB_PARTY_ROOT}/${PARTY_DOC}/players/${PLAYER_KEY}`;
    this.eventsPath = `${RTDB_PARTY_ROOT}/${PARTY_DOC}/events`;
  }

  async fetchFicha(): Promise<PlayerFichaPublic | null> {
    try {
      return await this.readRemote();
    } catch {
      return this.readCache();
    }
  }

  private async readRemote(): Promise<PlayerFichaPublic | null> {
    const snap = await get(ref(this.db, this.playerPath));
    if (!snap.exists()) return null;
    return toPlayerDoc(snap.val() as PlayerStateSource);
  }

  private readCache(): PlayerFichaPublic | null {
    try {
      const raw = localStorage.getItem(FS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PlayerStateSource;
      return toPlayerDoc(parsed);
    } catch {
      return null;
    }
  }

  subscribeFicha(cb: (ficha: PlayerFichaPublic | null) => void): () => void {
    const r = ref(this.db, this.playerPath);
    let active = true;
    return onValue(
      r,
      (snap) => {
        if (!active) return;
        if (!snap.exists()) {
          cb(null);
          return;
        }
        const data = snap.val() as PlayerStateSource & { savedAt?: unknown };
        cb(toPlayerDoc(data));
        try {
          localStorage.setItem(FS_CACHE_KEY, JSON.stringify({ ...data, classKey: data.classKey || 'warlock' }));
        } catch {
          // sin cache offline, seguimos
        }
      },
      (err) => {
        console.warn('[sync] onValue ficha falló (modo caché):', err);
        if (active) cb(this.readCache());
      },
    );
  }

  async writeFicha(ficha: PlayerFichaPublic): Promise<void> {
    const doc = toPlayerDoc(ficha as unknown as PlayerStateSource) as unknown as Record<string, unknown>;
    await update(ref(this.db, this.playerPath), { ...doc, savedAt: serverTimestamp() });
    try {
      const cache = { ...doc, classKey: doc.classKey, savedAt: new Date().toISOString() };
      localStorage.setItem(FS_CACHE_KEY, JSON.stringify(cache));
    } catch {
      // caché offline opcional
    }
  }

  async pushEvent(e: { playerKey: string; type: PlayerEventType; payload: Record<string, unknown> }): Promise<void> {
    await push(ref(this.db, this.eventsPath), { ...e, ts: serverTimestamp() });
  }
}
