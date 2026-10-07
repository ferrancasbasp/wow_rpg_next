// Contrato de datos Firestore — mirror de docs/firestore-schema.md.
// Este paquete es puro TS (sin Firebase ni Angular): los adaptadores de BD viven en la app.

/** Timestamp del lado servidor (serverTimestamp de Firestore). */
export type ServerTimestamp = unknown;

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type ItemSlot =
  | 'head'
  | 'chest'
  | 'hands'
  | 'legs'
  | 'feet'
  | 'mainHand'
  | 'offHand'
  | 'twoHand'
  | 'ranged'
  | 'accessory';

/** catalog/items/{itemId} */
export interface CatalogItem {
  id: string;
  name: string;
  slot: ItemSlot;
  rarity: Rarity;
  stats?: Record<string, number>;
  weaponDamage?: { min: number; max: number };
  defense?: number;
  iconImg?: string;
  description?: string;
  dropeable?: boolean;
  price?: number;
}

export interface NpcAttack {
  name: string;
  minDamage: number;
  maxDamage: number;
  isHeal?: boolean;
  aoe?: boolean;
  damageType?: string;
  inflictsEffects?: unknown[];
}

/** catalog/npcs/{npcId} */
export interface CatalogNpc {
  id: string;
  name: string;
  level: number;
  hp: number;
  armor: number;
  magicResist?: number;
  zone: string;
  attacks: NpcAttack[];
  imageUrl?: string;
  isElite?: boolean;
  description?: string;
}

/** Equipo resuelto en la factory (espejo de game.models.Equipment). */
export interface PlayerEquipmentItem {
  name: string;
  bonus: Record<string, number>;
  weaponDamage?: { min: number; max: number };
  defense?: number;
}

/** party/{partida}/players/{playerKey} — ficha PERSISTENTE (escrita por el jugador). Derivado no se persiste. */
export interface PlayerDoc {
  name: string;
  classKey: string;
  level: number;
  baseStats: Record<string, number>;
  talents: Record<string, number>;
  capstone: string | null;
  currentXP: number;
  trainedRanks: Record<string, number>;
  equipment: Record<string, PlayerEquipmentItem>;
  images: { horizontal: string; vertical: string };
  raidSymbol: number | null;
  savedAt?: ServerTimestamp;
}

/** party/{partida}/players/{playerKey}/inventory/{itemKey} */
export interface InventoryDoc {
  itemId: string;
  qty: number;
  equipped: boolean;
}

export type SessionPhase = 'ficheo' | 'combate' | 'bestia';

/** party/session/state (doc único, escribe el master) */
export interface SessionStateDoc {
  phase: SessionPhase;
  round: number;
  turnOrder: string[];
  activeTurn: string | null;
  raidTarget: string | null;
  masterKey: string;
  updatedAt?: ServerTimestamp;
}

/** party/session/players/{playerKey} (espejo que crea/actualiza el master) */
export interface SessionPlayerDoc {
  currentHP: number;
  currentMana: number | null;
  currentRage?: number;
  currentEnergy?: number;
  currentFocus?: number;
  comboPoints?: number;
  currentCooldowns: Record<string, number>;
  activeEffects: UnknownEffect[];
  activePet?: { petId: string; currentHP: number; currentMana: number } | null;
  companionPet?: { petId: string; currentHP: number; currentMana: number } | null;
  totems?: unknown[];
  infernalTurnsLeft?: number;
}

/** Forma genérica de un ActiveEffect (espejo del tipo de core: id,type,name,target,value,duration,...). */
export interface UnknownEffect {
  [k: string]: unknown;
}

/** party/session/enemies/{enemyKey} */
export interface SessionEnemyDoc {
  npcId: string;
  currentHP: number;
  effects: UnknownEffect[];
  index: number;
  target: string | null;
}

export type LogType = 'dano' | 'cura' | 'buff' | 'debuff' | 'status' | 'evento';

/** party/session/log/{logId} */
export interface SessionLogDoc {
  ts?: ServerTimestamp;
  text: string;
  type: LogType;
}

/** party/events/{eventId} — cola de comandos de jugadores (→ master). */
export interface EventDoc {
  playerKey: string;
  type: string;
  payload: Record<string, unknown>;
  ts?: ServerTimestamp;
}

export type PlayerEventType = 'lanzarHabilidad' | 'mover' | 'equipar' | 'cambiarStance' | 'usarItem';

/** Ficha persistida → mapeo al estado del jugador (solo campos persistibles). */
export interface PlayerFichaPublic {
  name: string;
  classKey: string;
  level: number;
  baseStats: Record<string, number>;
  talents: Record<string, number>;
  capstone: string | null;
  currentXP: number;
  trainedRanks: Record<string, number>;
  equipment: Record<string, PlayerEquipmentItem>;
  images: { horizontal: string; vertical: string };
  raidSymbol: number | null;
}
