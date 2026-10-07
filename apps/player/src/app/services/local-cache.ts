import { FS_CACHE_KEY, LEGACY_CACHE_KEY, LEGACY_CACHE_KEYS, PARTY_DOC, PLAYER_KEY } from './firebase.config';

export interface LocalCacheRoot {
  v: 1;
  savedAt: string;
  partidas: Record<string, Record<string, string>>;
  localsaves: Record<string, string>;
  legacy: Record<string, string>;
}

function blankRoot(): LocalCacheRoot {
  return { v: 1, savedAt: new Date().toISOString(), partidas: {}, localsaves: {}, legacy: {} };
}

export function readCacheRoot(): LocalCacheRoot {
  try {
    const raw = localStorage.getItem(FS_CACHE_KEY);
    if (!raw) return blankRoot();
    const r = JSON.parse(raw) as LocalCacheRoot;
    if (!r || r.v !== 1) return blankRoot();
    r.partidas ??= {};
    r.localsaves ??= {};
    r.legacy ??= {};
    return r;
  } catch {
    return blankRoot();
  }
}

export function writeCacheRoot(r: LocalCacheRoot): void {
  try {
    r.savedAt = new Date().toISOString();
    localStorage.setItem(FS_CACHE_KEY, JSON.stringify(r));
  } catch {
    // caché offline opcional; si falla, seguimos sin ella
  }
}

export function getPlayerSnapshot(partida: string, playerKey: string): string | null {
  return readCacheRoot().partidas[partida]?.[playerKey] ?? null;
}

export function setPlayerSnapshot(partida: string, playerKey: string, json: string): void {
  const r = readCacheRoot();
  (r.partidas[partida] ??= {})[playerKey] = json;
  writeCacheRoot(r);
}

export function getLocalSave(playerKey: string): string | null {
  return readCacheRoot().localsaves[playerKey] ?? null;
}

export function setLocalSave(playerKey: string, json: string): void {
  const r = readCacheRoot();
  r.localsaves[playerKey] = json;
  writeCacheRoot(r);
}

let hygieneDone = false;

export function ensureCacheHygiene(): void {
  if (hygieneDone) return;
  hygieneDone = true;
  try {
    const r = readCacheRoot();
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || k === FS_CACHE_KEY) continue;
      const raw = localStorage.getItem(k);
      if (raw === null) continue;
      if (k === LEGACY_CACHE_KEY) {
        r.localsaves[PLAYER_KEY] = raw;
      } else if (k.startsWith(`${LEGACY_CACHE_KEY}_`)) {
        const playerKey = k.slice(LEGACY_CACHE_KEY.length + 1);
        (r.partidas[PARTY_DOC] ??= {})[playerKey] = raw;
      } else if (LEGACY_CACHE_KEYS.includes(k)) {
        r.legacy[k] = raw;
      } else {
        continue;
      }
      localStorage.removeItem(k);
    }
    writeCacheRoot(r);
  } catch {
    // si el arranque de la higiene falla, la app sigue sin cache limpia
  }
}
