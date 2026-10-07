import type { PlayerDoc, PlayerEventType, PlayerFichaPublic } from './contracts';

// El estado del jugador en la app mezcla ficha persistible con estado volátil (HP/MP
// actuales, cooldowns, effects, pet, turno). Solo lo persistible viaja a Firestore:
// el resto es derivado o estado en vivo de `session/` (que escribe el master).
export const PERSISTIBLE_FIELDS = [
  'name',
  'classKey',
  'level',
  'baseStats',
  'talents',
  'capstone',
  'currentXP',
  'trainedRanks',
  'equipment',
  'images',
  'raidSymbol',
] as const;

export type PersistibleField = (typeof PERSISTIBLE_FIELDS)[number];

/** Todo lo que el cliente sabe del jugador, incluyendo estado volátil. */
export interface PlayerStateSource {
  name?: string;
  classKey?: string;
  level?: number;
  baseStats?: Record<string, number>;
  talents?: Record<string, number>;
  capstone?: string | null;
  currentXP?: number;
  trainedRanks?: Record<string, number>;
  equipment?: Record<string, unknown>;
  images?: { horizontal: string; vertical: string };
  raidSymbol?: number | null;
  [k: string]: unknown;
}

/** Extrae solo los campos persistibles (quita HP/MP actuales, cooldowns, effects, pet...). */
export function toPlayerDoc(source: PlayerStateSource): PlayerFichaPublic {
  if (!source || typeof source !== 'object') {
    throw new Error('toPlayerDoc: source no es un objeto');
  }
  const doc: PlayerFichaPublic = {
    name: typeof source.name === 'string' ? source.name : '',
    classKey: typeof source.classKey === 'string' ? source.classKey : '',
    level: numOr(source.level, 1),
    baseStats: objOr(source.baseStats),
    talents: objOr(source.talents),
    capstone: source.capstone == null ? null : String(source.capstone),
    currentXP: numOr(source.currentXP, 0),
    trainedRanks: objOr(source.trainedRanks),
    equipment: equipmentOr(source.equipment),
    images: source.images && typeof source.images === 'object' ? (source.images as PlayerFichaPublic['images']) : { horizontal: '', vertical: '' },
    raidSymbol: source.raidSymbol == null ? null : Number(source.raidSymbol),
  };
  return doc;
}

/** Sobrescribe en un estado la ficha llegada de Firestore (solo campos persistibles). */
export function applyFicha(state: PlayerStateSource, ficha: PlayerFichaPublic | null): PlayerStateSource {
  if (!ficha) return state;
  const doc = toPlayerDoc(ficha as unknown as PlayerStateSource) as PlayerStateSource;
  return { ...state, ...doc };
}

function numOr(v: unknown, dflt: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : dflt;
}

function objOr(v: unknown): Record<string, number> {
  return v && typeof v === 'object' ? (v as Record<string, number>) : {};
}

export function equipmentOr(v: unknown): PlayerFichaPublic['equipment'] {
  if (v && typeof v === 'object') return v as PlayerFichaPublic['equipment'];
  return {};
}

/** Build de un comando para party/events (ts lo pone el servidor). */
export function buildEvent(
  playerKey: string,
  type: PlayerEventType,
  payload: Record<string, unknown>,
): { playerKey: string; type: PlayerEventType; payload: Record<string, unknown> } {
  if (!playerKey) throw new Error('buildEvent: playerKey vacío');
  return { playerKey, type, payload };
}

/** Versión para insertar en Firestore con serverTimestamp. */
export function eventDoc(e: { playerKey: string; type: PlayerEventType; payload: Record<string, unknown> }, serverTimestamp: unknown) {
  return { ...e, ts: serverTimestamp };
}

export function rebuildPlayerDoc(doc: PlayerDoc): PlayerFichaPublic {
  return toPlayerDoc(doc as unknown as PlayerStateSource);
}
