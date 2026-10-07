import { describe, expect, it } from 'vitest';
import { createCombatEngine } from './resolve';
import type { ClassSpec } from './types';
import type { CombatContext } from './types';

const SPEC: ClassSpec = {
  key: 'dummy',
  name: 'Dummy',
  resource: { type: 'mana', label: 'Maná', color: '#3498db', start: 'full' },
  baseStats: { fuerza: 10, agilidad: 10, intelecto: 20, aguante: 10, espiritu: 10 },
  statGrowth: { fuerza: 0.5, agilidad: 0.5, intelecto: 2.0, aguante: 1.0, espiritu: 0.5 },
  formulas: {
    hp: (s: any) => Math.round(30 + s.aguante * 9 + (s.level || 1) * 5),
    mana: (s: any) => Math.round(40 + s.intelecto * 15 + (s.level || 1) * 5),
    spellPower: (s: any) => Math.round(s.intelecto * 0.65),
    attackPower: (s: any) => Math.round(s.fuerza * 2),
    manaRegen: (s: any) => Math.round(s.espiritu * 0.5),
    armor: (s: any) => Math.round(s.aguante * 2),
  },
  talents: [
    {
      id: 'dark_synergy',
      name: 'Sinergia Oscura',
      icon: '💀',
      iconImg: 'img/talents/dummy/dark_synergy.jpg',
      maxPoints: 3,
      description: 'Shadow Bolt destruye al objetivo debilitado.',
      modifiers: [
        {
          stat: 'damage',
          type: 'pct',
          valuePerRank: 15,
          target: 'ability:shadow_bolt',
          conditions: [{ kind: 'targetHasEffect', name: 'Corruption' }],
        },
        {
          stat: 'damage',
          type: 'pct',
          valuePerRank: 5,
          target: 'ability:shadow_bolt',
          conditions: [{ kind: 'targetHasDot' }],
        },
      ],
    },
  ],
  abilities: [
    {
      id: 'shadow_bolt',
      name: 'Shadow Bolt',
      icon: '💀',
      iconImg: 'img/abilities/dummy/shadow_bolt.jpg',
      school: 'Sombras',
      type: 'damage',
      requiredLevel: 1,
      damageType: 'shadow',
      baseDamage: 100,
      spellPowerRatio: 1,
      costPct: 5,
      castType: 'cast',
      cooldown: 0,
      weaponMultiplier: 0,
      bonusPerRank: [100],
    },
  ],
};

const engine = createCombatEngine(SPEC);

function state() {
  return {
    level: 20,
    baseStats: SPEC.baseStats,
    effects: [],
    talents: { dark_synergy: 3 },
    gear: {},
  };
}

function ctx(target: CombatContext['target']): CombatContext {
  return {
    caster: { level: 20, stats: engine.stats(state()), talents: { dark_synergy: 3 }, effects: [], soulShards: 0 },
    target,
  };
}

const CLEAN_TARGET = { currentHP: 500, maxHP: 500, hpPct: 100, activeEffects: [], armor: 20, magicResist: 10 };

describe('Condiciones de target (debuffs del enemigo) en el engine', () => {
  it('sin debuff: daño base', () => {
    const d = engine.damage(state(), SPEC.abilities[0], 1, ctx(CLEAN_TARGET));
    expect(d).not.toBeNull();
    const mid = (d!.min + d!.max) / 2;
    expect(mid).toBeLessThan(150);
  });

  it('con Corruption en el target: Shadow Bolt +45% (3/3 × 15%)', () => {
    const c = ctx({ ...CLEAN_TARGET, activeEffects: [{ name: 'Corruption', type: 'debuff', school: 'Sombras' }] });
    const d = engine.damage(state(), SPEC.abilities[0], 1, c);
    const base = engine.damage(state(), SPEC.abilities[0], 1, ctx(CLEAN_TARGET));
    expect(d!.min).toBe(Math.round(base!.min * 1.45));
  });

  it('con un DoT cualquiera en el target: +15% (3/3 × 5%)', () => {
    const c = ctx({ ...CLEAN_TARGET, activeEffects: [{ name: 'Sangrado', type: 'dot', school: 'Físico' }] });
    const d = engine.damage(state(), SPEC.abilities[0], 1, c);
    const base = engine.damage(state(), SPEC.abilities[0], 1, ctx(CLEAN_TARGET));
    expect(d!.min).toBe(Math.round(base!.min * 1.15));
  });

  it('con Corruption y DoT a la vez: se acumulan ambas condiciones', () => {
    const c = ctx({ ...CLEAN_TARGET, activeEffects: [{ name: 'Corruption', type: 'debuff', school: 'Sombras' }, { name: 'Sangrado', type: 'dot', school: 'Físico' }] });
    const d = engine.damage(state(), SPEC.abilities[0], 1, c);
    const base = engine.damage(state(), SPEC.abilities[0], 1, ctx(CLEAN_TARGET));
    expect(d!.min).toBe(Math.round(base!.min * 1.6));
  });
});
