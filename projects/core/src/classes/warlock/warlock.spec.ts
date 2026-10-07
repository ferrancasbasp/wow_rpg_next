import { describe, expect, it } from 'vitest';
import { createCombatEngine } from '../../engine/resolve';
import { WARLOCK } from '../warlock/warlock';

const baseWarlock = WARLOCK;

describe('Warlock stats de paridad (nivel 10, sin equipo)', () => {
  const engine = createCombatEngine(baseWarlock);
  const state = {
    level: 10,
    baseStats: WARLOCK.baseStats,
    effects: [],
    talents: {},
    gear: {},
  };

  it('finalStats = base + floor((level-1) * growth)', () => {
    const result = engine.stats(state);
    expect(result).toEqual({
      fuerza: 10 + Math.floor(9 * 0.3),
      agilidad: 10 + Math.floor(9 * 0.3),
      intelecto: 16 + Math.floor(9 * 2.0),
      aguante: 14 + Math.floor(9 * 1.8),
      espiritu: 12 + Math.floor(9 * 0.8),
    });
  });

  it('maxHP = round(30 + aguante*9 + lvl*5)', () => {
    expect(engine.maxHp(state)).toBe(Math.round(30 + (14 + Math.floor(9 * 1.8)) * 9 + 10 * 5));
  });

  it('maxMana = round(40 + intelecto*15 + lvl*5)', () => {
    expect(engine.maxMana(state)).toBe(Math.round(40 + (16 + Math.floor(9 * 2.0)) * 15 + 10 * 5));
  });

  it('spellPower = round(intelecto * 0.65)', () => {
    expect(engine.spellPower(state)).toBe(Math.round((16 + Math.floor(9 * 2.0)) * 0.65));
  });
});

describe('Warlock daño de paridad (nivel 25, con SP)', () => {
  const engine = createCombatEngine(baseWarlock);
  const state = {
    level: 25,
    baseStats: WARLOCK.baseStats,
    effects: [],
    talents: {},
    gear: {},
  };
  const sp = engine.spellPower(state);
  const int25 = 16 + Math.floor(24 * 2.0);

  it('Shadow Bolt R2 = round(30 + SP)', () => {
    const dmg = engine.damage(state, WARLOCK.abilities.find(a => a.id === 'shadow_bolt')!, 2)!;
    expect(dmg.min).toBe(Math.round(30 + sp));
    expect(dmg.max).toBe(Math.round(42 + sp));
    expect(sp).toBe(Math.round(int25 * 0.65));
  });

  it('Shadow Mastery 2/2: +10% a Shadow Bolt', () => {
    const st = { ...state, talents: { shadow_mastery: 2 } };
    const dmg = engine.damage(st, WARLOCK.abilities.find(a => a.id === 'shadow_bolt')!, 3)!;
    expect(dmg.min).toBe(Math.round(Math.round(50 + sp) * 1.1));
  });

  it('Contagion 3/3: +6% a DoTs (Corruption)', () => {
    const st = { ...state, talents: { contagion: 3 } };
    const corruption = WARLOCK.abilities.find(a => a.id === 'corruption')!;
    const baseDot = engine.dot(state, corruption, 4)!;
    const boostedDot = engine.dot(st, corruption, 4)!;
    expect(boostedDot.dotTotal).toBe(Math.round(baseDot.dotTotal * 1.06));
  });

  it('DoT Master 2/2: +2 turnos a Corruption', () => {
    const st = { ...state, talents: { dot_master: 2 } };
    const corruption = WARLOCK.abilities.find(a => a.id === 'corruption')!;
    const result = engine.dot(st, corruption, 2)!;
    expect(result.dotDuration).toBe(5 + 2);
  });

  it('Destruction Specialization: crit según rank', () => {
    const st = { ...state, talents: { destruction_specialization: 3 } };
    const chaos = WARLOCK.abilities.find(a => a.id === 'chaos_bolt')!;
    expect(engine.crit(st, chaos)).toBeCloseTo(engine.crit(state, chaos) + 15, 5);
  });
});

describe('Warlock condiciones sobre el target', () => {
  const engine = createCombatEngine(baseWarlock);
  const state = {
    level: 25,
    baseStats: WARLOCK.baseStats,
    effects: [],
    talents: {},
    gear: {},
  };
  const shadowBolt = WARLOCK.abilities.find(a => a.id === 'shadow_bolt')!;

  const ctx = (targetOverrides: Partial<import('../../engine/types').TargetState>) => ({
    caster: { level: 25, stats: engine.stats(state), talents: {}, effects: [], soulShards: 0 },
    target: { currentHP: 100, maxHP: 200, hpPct: 50, activeEffects: [], armor: 8, magicResist: 3, ...targetOverrides },
  });

  it('sin ctx no se pierde el rango base de Shadow Bolt', () => {
    const dmg = engine.damage(state, shadowBolt, 4, undefined)!;
    expect(dmg.min).toBeGreaterThan(0);
  });

  it('Contexto con target construido correctamente', () => {
    const c = ctx({ hpPct: 20 });
    expect(c.target.hpPct).toBe(20);
    expect(c.caster.level).toBe(25);
  });
});
