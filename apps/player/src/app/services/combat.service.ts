import { inject, Injectable, signal } from '@angular/core';
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, ref, set, update, push, onValue, serverTimestamp, increment, type Database } from 'firebase/database';
import { FIREBASE_CONFIG, PARTY_DOC, RTDB_PARTY_ROOT } from './firebase.config';
import type { NpcSpec } from '../data/npc-registry';
import type { CombatEncounter, CombatEnemy, CombatEnemyEffect, CombatLogEntry } from '../models/combat';

/**
 * Encuentro de la partida: party/{partida}/combat.
 * El Master crea/avanza el encuentro; el jugador lee el target (debuffs) y
 * aplica daño directo.
 */
@Injectable({ providedIn: 'root' })
export class CombatService {
  readonly combat = signal<CombatEncounter | null>(null);

  private readonly db: Database;
  readonly combatPath: string;

  constructor() {
    const app: FirebaseApp = initializeApp(FIREBASE_CONFIG, 'wow-rpg-combat');
    this.db = getDatabase(app);
    this.combatPath = `${RTDB_PARTY_ROOT}/${PARTY_DOC}/combat`;
    onValue(
      ref(this.db, this.combatPath),
      (snap) => {
        if (!snap.exists()) {
          this.combat.set(null);
          return;
        }
        this.combat.set(this.normalize(snap.val() as Partial<CombatEncounter>));
      },
      (err) => console.warn('[combat] sin conexión al encuentro:', err),
    );
  }

  get enemy(): CombatEnemy | null {
    const c = this.combat();
    return c?.active && c.enemy ? c.enemy : null;
  }

  private newId(): string {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  private normalize(raw: Partial<CombatEncounter>): CombatEncounter {
    return {
      active: !!raw.active,
      turn: raw.turn && raw.turn > 0 ? raw.turn : 1,
      enemy: raw.enemy
        ? {
            npcId: raw.enemy.npcId || '',
            name: raw.enemy.name || 'Enemigo',
            iconImg: raw.enemy.iconImg || '',
            level: raw.enemy.level || 1,
            maxHP: raw.enemy.maxHP || 100,
            currentHP: raw.enemy.currentHP ?? raw.enemy.maxHP ?? 100,
            armor: raw.enemy.armor || 0,
            magicResist: raw.enemy.magicResist || 0,
            zone: raw.enemy.zone,
            isElite: raw.enemy.isElite,
            effects: Array.isArray(raw.enemy.effects) ? raw.enemy.effects : [],
          }
        : null,
      updatedAt: raw.updatedAt || 0,
      log: Array.isArray(raw.log) ? raw.log : [],
    };
  }

  private log(entries: Partial<CombatLogEntry>[]) {
    const c = this.combat();
    const current = c?.log || [];
    const merged = [
      ...current,
      ...entries.map((e) => ({ id: this.newId(), ts: Date.now(), text: e.text || '' })),
    ].slice(-200);
    return merged;
  }

  async createEncounter(npc: NpcSpec): Promise<void> {
    const enemy: CombatEnemy = {
      npcId: npc.id,
      name: npc.name,
      iconImg: npc.iconImg,
      level: npc.level,
      maxHP: npc.maxHP,
      currentHP: npc.maxHP,
      armor: npc.armor,
      magicResist: npc.magicResist,
      zone: npc.zone,
      isElite: npc.isElite,
      effects: [],
    };
    await set(ref(this.db, this.combatPath), {
      active: true,
      turn: 1,
      enemy,
      log: [{ id: this.newId(), ts: Date.now(), text: `Encuentro iniciado: ${npc.name}` }],
      updatedAt: serverTimestamp(),
    });
  }

  async clearEncounter(): Promise<void> {
    await update(ref(this.db, this.combatPath), {
      active: false,
      enemy: null,
      updatedAt: serverTimestamp(),
    });
  }

  async damageEnemy(points: number, note?: string): Promise<void> {
    const text = note ? note : `El enemigo recibe ${points} de daño`;
    await update(ref(this.db, this.combatPath), {
      'enemy/currentHP': increment(-Math.round(points)),
      log: this.log([{ text }]),
      updatedAt: serverTimestamp(),
    });
  }

  async healEnemy(points: number): Promise<void> {
    await update(ref(this.db, this.combatPath), {
      'enemy/currentHP': increment(Math.round(points)),
      log: this.log([{ text: `El enemigo se cura ${Math.round(points)}` }]),
      updatedAt: serverTimestamp(),
    });
  }

  async applyEffect(effect: Omit<CombatEnemyEffect, 'id'>, source: 'master' | 'player' = 'master'): Promise<void> {
    const turnsLeft = effect.turnsLeft ?? 1;
    const full: CombatEnemyEffect = {
      ...effect,
      id: this.newId(),
      turnsLeft,
      source,
    };
    const key = `enemy/effects/${full.id}`;
    await update(ref(this.db, this.combatPath), {
      [key]: full,
      log: this.log([{ text: `${source === 'master' ? 'Master' : 'Jugador'} aplica ${effect.name}` }]),
      updatedAt: serverTimestamp(),
    });
  }

  async removeEffect(effectId: string): Promise<void> {
    const current = this.combat()?.enemy?.effects || [];
    const next = current.filter((e) => e.id !== effectId);
    await set(ref(this.db, `${this.combatPath}/enemy/effects`), next);
    await update(ref(this.db, this.combatPath), { log: this.log([{ text: 'Efecto eliminado del objetivo' }]) });
  }

  /** Avanza el turno del enemigo: ticks de DoT, descuenta duraciones, turno+1. */
  async endTurn(): Promise<void> {
    const c = this.combat();
    if (!c?.enemy) return;
    const enemy = c.enemy;
    const effects = (enemy.effects || []).map((e) => ({ ...e, turnsLeft: e.turnsLeft - 1 }));
    const stillActive = effects.filter((e) => e.turnsLeft > 0);
    const dots = effects.filter((e) => e.type === 'dot' && e.value && e.value > 0);
    const dotTotal = dots.reduce((acc, e) => acc + (e.value || 0), 0);
    const hp = Math.max(0, enemy.currentHP - dotTotal);
    const texts: string[] = [];
    if (dotTotal > 0) texts.push(`DoT: el objetivo pierde ${dotTotal} HP`);
    const killed = hp <= 0;
    if (killed) texts.push(`${enemy.name} es derrotado`);
    const updates: Record<string, unknown> = {
      'enemy/currentHP': hp,
      'enemy/effects': stillActive,
      turn: c.turn + 1,
      log: this.log(texts.map((text) => ({ text }))),
      updatedAt: serverTimestamp(),
    };
    if (killed) updates.active = false;
    await update(ref(this.db, this.combatPath), updates);
  }
}
