// ARCHIVADO (2026-10-07): se sustituyó por rtdb-sync.service.ts porque la red
// del equipo bloquea firestore.googleapis.com. Se conserva como referencia del
// adaptador Firestore (implementación del mismo StateBackend).
import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  collection,
  getDoc,
  onSnapshot,
  setDoc,
  addDoc,
  serverTimestamp,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';
import { FIREBASE_CONFIG, PLAYER_KEY, PARTY_DOC, FS_CACHE_KEY } from './firebase.config';
import type { PlayerFichaPublic } from '@state/contracts';
import type { PlayerStateSource } from '@state/mappers';
import { toPlayerDoc } from '@state/mappers';
import type { StateBackend } from '@state/gateway';
import type { PlayerEventType } from '@state/contracts';

export class FirestoreStateBackend implements StateBackend {
  private readonly app: FirebaseApp;
  private readonly db: Firestore;
  private readonly playerRef;
  private readonly eventsRef;

  constructor() {
    this.app = initializeApp(FIREBASE_CONFIG, 'wow-rpg-player');
    this.db = getFirestore(this.app);
    this.playerRef = doc(this.db, 'party', PARTY_DOC, 'players', PLAYER_KEY);
    this.eventsRef = collection(this.db, 'party', PARTY_DOC, 'events');
  }

  async fetchFicha(): Promise<PlayerFichaPublic | null> {
    // Firestore es la fuente de verdad; localStorage es solo caché offline
    // (lectura inicial) en caso de no haber ficha remota todavía.
    try {
      return await this.readRemote();
    } catch {
      return this.readCache();
    }
  }

  private async readRemote(): Promise<PlayerFichaPublic | null> {
    const snap = await getDoc(this.playerRef);
    if (!snap.exists()) return null;
    return toPlayerDoc(snap.data() as unknown as PlayerStateSource);
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
    let unsub: Unsubscribe | null = null;
    let active = true;
    // onSnapshot puede fallar por reglas/red si Firestore no está disponible;
    // en ese caso el cliente sigue con localStorage como caché.
    try {
      unsub = onSnapshot(
        this.playerRef,
        (snap) => {
          if (!active) return;
          if (!snap.exists()) {
            cb(null);
            return;
          }
          const data = snap.data() as PlayerStateSource & { savedAt?: unknown };
          cb(toPlayerDoc(data));
          try {
            localStorage.setItem(FS_CACHE_KEY, JSON.stringify({ ...data, classKey: data.classKey || 'warlock' }));
          } catch {
            // sin cache offline, seguimos
          }
        },
        (err) => {
          console.warn('[sync] onSnapshot ficha falló (modo caché):', err);
          if (active) cb(this.readCache());
        },
      );
    } catch (e) {
      console.warn('[sync] no se pudo suscribir a la ficha (modo caché):', e);
      setTimeout(() => active && cb(this.readCache()), 0);
    }
    return () => {
      active = false;
      unsub?.();
    };
  }

  async writeFicha(ficha: PlayerFichaPublic): Promise<void> {
    const doc = toPlayerDoc(ficha as unknown as PlayerStateSource);
    await setDoc(this.playerRef, { ...doc, savedAt: serverTimestamp() }, { merge: true });
    try {
      localStorage.setItem(FS_CACHE_KEY, JSON.stringify({ ...doc, classKey: doc.classKey }));
    } catch {
      // caché offline opcional
    }
  }

  async pushEvent(e: { playerKey: string; type: PlayerEventType; payload: Record<string, unknown> }): Promise<void> {
    await addDoc(this.eventsRef, { ...e, ts: serverTimestamp() });
  }
}
