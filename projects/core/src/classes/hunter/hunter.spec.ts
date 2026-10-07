import { describe, expect, it } from 'vitest';
import { createCombatEngine } from '../../engine/resolve';
import { resolveModifiers } from '../../engine/modifiers';
import { HUNTER } from './hunter';

const engine = createCombatEngine(HUNTER);

function hunterState(overrides: Record<string, unknown> = {}) {
  return {
    level: 10,
    baseStats: HUNTER.baseStats,
    effects: [],
    talents: {},
    gear: {},
    ...overrides,
  };
}

describe('Hunter stats de paridad (nivel 10, sin equipo)', () => {
  const state = hunterState();

  it('finalStats = base + floor((level-1) * growth)', () => {
    expect(engine.stats(state)).toEqual({
      fuerza: 10 + Math.floor(9 * 0.4),
      agilidad: 25 + Math.floor(9 * 2.2),
      intelecto: 6 + Math.floor(9 * 0.1),
      aguante: 19 + Math.floor(9 * 1.3),
      espiritu: 12 + Math.floor(9 * 0.3),
    });
  });

  it('maxHP = round(35 + aguante*9 + lvl*5)', () => {
    expect(engine.maxHp(state)).toBe(Math.round(35 + (19 + Math.floor(9 * 1.3)) * 9 + 10 * 5));
  });

  it('attackPower = agilidad * 2', () => {
    const agi = 25 + Math.floor(9 * 2.2);
    expect(engine.attackPower(state)).toBe(agi * 2);
  });

  it('resourceMax = 100 (focus)', () => {
    expect(engine.resourceMax(state)).toBe(100);
  });

  it('meleeCrit = 5 + agilidad/20 + nivel*0.02', () => {
    const agi = 25 + Math.floor(9 * 2.2);
    expect(engine.meleeCrit(state)).toBeCloseTo(5 + agi / 20 + 10 * 0.02, 5);
  });
});

describe('Hunter daño con arma (nivel 10, arco 35)', () => {
  const state = hunterState({ rangedDamage: 35 });
  const weaponDmg = 35;
  const agi = 25 + Math.floor(9 * 2.2);
  const apBonus = Math.round((agi * 2) / 7);

  it('Auto Shot (usesWeaponDamage): scale con rangedDamage', () => {
    const ability = HUNTER.abilities.find(a => a.id === 'auto_shot')!;
    const { min, max } = engine.damage(state, ability, 1)!;
    const base = weaponDmg + apBonus;
    expect(min).toBe(Math.round(base * 0.5));
    expect(max).toBe(Math.round(base * 1.5));
  });

  it('Arcane Shot R2 (magical): 0.5*rango + 0.5*(arma+ap)', () => {
    const ability = HUNTER.abilities.find(a => a.id === 'arcanic_shot')!;
    const { min, max } = engine.damage(state, ability, 2)!;
    const bowBonus = Math.round((weaponDmg + apBonus) * 0.5);
    const range = ability.damageRanges!.find(dr => dr.rank === 2)!;
    expect(min).toBe(Math.round(range.min * 0.5 + bowBonus));
    expect(max).toBe(Math.round(range.max * 0.5 + bowBonus));
  });

  it('Aimed Shot R1 daño físico plano (rango 100-130)', () => {
    const ability = HUNTER.abilities.find(a => a.id === 'aimed_shot')!;
    const { min, max } = engine.damage(state, ability, 1)!;
    expect(min).toBe(100);
    expect(max).toBe(130);
  });

  it('Ranged Weapon Spec 3/3: +6% a los disparos', () => {
    const st = hunterState({ rangedDamage: 35, talents: { ranged_weapon_spec: 3 } });
    const auto = HUNTER.abilities.find(a => a.id === 'auto_shot')!;
    const base = engine.damage(state, auto, 1)!;
    const boosted = engine.damage(st, auto, 1)!;
    expect(boosted.min).toBe(Math.round(base.min * 1.06));
    expect(boosted.max).toBe(Math.round(base.max * 1.06));
  });

  it('Serpent Sting DoT: total dotRanges con tick = total/duración', () => {
    const ability = HUNTER.abilities.find(a => a.id === 'serpent_sting')!;
    const dot = engine.dot(state, ability, 2)!;
    expect(dot.dotTotal).toBe(112);
    expect(dot.dotDuration).toBe(4);
    expect(dot.dotTick).toBe(28);
  });
});

describe('Hunter focus', () => {
  const state = hunterState();

  it('coste base Aimed Shot = 60', () => {
    const ability = HUNTER.abilities.find(a => a.id === 'aimed_shot')!;
    expect(engine.resourceCost(state, ability, 1)).toBe(60);
  });

  it('Improved Aimed Shot 3/3: -15 focus = 45', () => {
    const st = hunterState({ talents: { improved_aimed_shot: 3 } });
    const ability = HUNTER.abilities.find(a => a.id === 'aimed_shot')!;
    expect(engine.resourceCost(st, ability, 1)).toBe(45);
  });

  it('Auto Shot genera 5 focus', () => {
    const ability = HUNTER.abilities.find(a => a.id === 'auto_shot')!;
    expect(engine.focusGain(state, ability)).toBe(5);
  });

  it('El focus no regenera al final del turno', () => {
    expect(engine.energyRegen(state)).toBe(0);
  });
});

describe('Hunter crit', () => {
  const state = hunterState();

  it('Mortal Shots 2/2: +10% crit damage (stat resolvible)', () => {
    const st = hunterState({ talents: { mortal_shots: 2 } });
    const auto = HUNTER.abilities.find(a => a.id === 'auto_shot')!;
    const mods = resolveModifiers(HUNTER.talents, st.talents, auto);
    expect(mods.critDamagePct).toBe(10);
    expect(mods.critDamagePct).toBeGreaterThan(0);
  });

  it('Improved Aspect of the Hawk: +crit solo con el aspecto activo', () => {
    const effects = [{ id: 1, type: 'buff' as const, name: 'Aspect of the Hawk', target: 'attackPower', value: 20, duration: 30 }];
    const st = hunterState({ talents: { improved_aspect_of_the_hawk: 3 }, effects });
    const auto = HUNTER.abilities.find(a => a.id === 'auto_shot')!;
    const baseMelee = 5 + (25 + Math.floor(9 * 2.2)) / 20 + 10 * 0.02;
    const ctx = {
      caster: { level: 10, stats: engine.stats(st), talents: st.talents, effects, soulShards: 0 },
      target: { currentHP: 100, maxHP: 100, hpPct: 100, activeEffects: [], armor: 8, magicResist: 2 },
    };
    expect(engine.crit(st, auto, ctx)).toBeCloseTo(baseMelee + 12, 5);
    expect(engine.crit(state, auto)).toBeCloseTo(baseMelee, 5);
  });
});

describe('Hunter data de espec completa', () => {
  it('tiene los 2 pets con focusGain 5', () => {
    expect(HUNTER.pets.map(p => p.id)).toEqual(['wolf', 'bear']);
    expect(HUNTER.pets.every(p => p.focusGain === 5)).toBe(true);
  });

  it('los 3 capstones hunter están declarados', () => {
    expect(HUNTER.capstones.map(c => c.id)).toEqual(['lone_wolf', 'explosive_shot', 'animal_companion']);
  });

  it('summon_wolf y summon_bear son isPetSummon', () => {
    const wolf = HUNTER.abilities.find(a => a.id === 'summon_wolf')!;
    const bear = HUNTER.abilities.find(a => a.id === 'summon_bear')!;
    expect(wolf.isPetSummon).toBe('wolf');
    expect(bear.isPetSummon).toBe('bear');
  });
});
