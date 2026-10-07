import { describe, expect, it } from 'vitest';
import { createCombatEngine } from '../../engine/resolve';
import { ROGUE } from './rogue';

const engine = createCombatEngine(ROGUE);

function rogueState(overrides: Record<string, unknown> = {}) {
  return {
    level: 10,
    baseStats: ROGUE.baseStats,
    effects: [],
    talents: {},
    gear: {},
    ...overrides,
  };
}

describe('Rogue stats de paridad (nivel 10, sin equipo)', () => {
  const state = rogueState();

  it('finalStats = base + floor((level-1) * growth)', () => {
    expect(engine.stats(state)).toEqual({
      fuerza: 15 + Math.floor(9 * 0.5),
      agilidad: 25 + Math.floor(9 * 2.2),
      intelecto: 5 + Math.floor(9 * 0.1),
      aguante: 18 + Math.floor(9 * 1.2),
      espiritu: 10 + Math.floor(9 * 0.3),
    });
  });

  it('maxHP = round(35 + aguante*9 + lvl*5)', () => {
    expect(engine.maxHp(state)).toBe(Math.round(35 + (18 + Math.floor(9 * 1.2)) * 9 + 10 * 5));
  });

  it('maxMana = 0 (sin mana)', () => {
    expect(engine.maxMana(state)).toBe(0);
  });

  it('attackPower = agilidad * 2', () => {
    const agi = 25 + Math.floor(9 * 2.2);
    expect(engine.attackPower(state)).toBe(agi * 2);
  });

  it('resourceMax = 100 (energía)', () => {
    expect(engine.resourceMax(state)).toBe(100);
  });

  it('resourceMax con capstone Shadow Dance = 120', () => {
    expect(engine.resourceMax(rogueState({ capstone: 'shadow_dance' }))).toBe(120);
  });

  it('energyRegen = 20 por turno base', () => {
    expect(engine.energyRegen(state)).toBe(20);
  });

  it('energyRegen con Vitality 3/3 = +30%', () => {
    expect(engine.energyRegen(rogueState({ talents: { vitality: 3 } }))).toBe(26);
  });

  it('meleeCrit = 5 + agilidad/20 + nivel*0.02', () => {
    const agi = 25 + Math.floor(9 * 2.2);
    expect(engine.meleeCrit(state)).toBeCloseTo(5 + agi / 20 + 10 * 0.02, 5);
  });
});

describe('Rogue daño con arma (nivel 10, dagger 28 + 22 off-hand)', () => {
  const state = rogueState({ mainHandDamage: 28, offHandDamage: 22 });
  const weaponDmg = 28 + 22;
  const agi = 25 + Math.floor(9 * 2.2);
  const apBonus = Math.round((agi * 2) / 7);

  it('Basic Attack (usesWeaponDamage): min=round((wpn+ap)*0.5), max=1.5x', () => {
    const ability = ROGUE.abilities.find(a => a.id === 'basic_attack')!;
    const { min, max } = engine.damage(state, ability, 1)!;
    const base = weaponDmg + apBonus;
    expect(min).toBe(Math.round(base * 0.5));
    expect(max).toBe(Math.round(base * 1.5));
  });

  it('Sinister Strike R1 (bonusPerRank+wpnMult 1.0): base=round(wpn*1.0)+ap+bonus', () => {
    const ability = ROGUE.abilities.find(a => a.id === 'sinister_strike')!;
    const { min, max } = engine.damage(state, ability, 1)!;
    const base = Math.round(weaponDmg * 1.0) + apBonus + (ability.bonusPerRank![0]);
    expect(min).toBe(Math.round(base * 0.5));
    expect(max).toBe(Math.round(base * 1.5));
  });

  it('Aggression 2/2: +10% a Sinister Strike', () => {
    const st = rogueState({ mainHandDamage: 28, offHandDamage: 22, talents: { aggression: 2 } });
    const ability = ROGUE.abilities.find(a => a.id === 'sinister_strike')!;
    const base = engine.damage(state, ability, 1)!;
    const boosted = engine.damage(st, ability, 1)!;
    expect(boosted.min).toBe(Math.round(base.min * 1.1));
    expect(boosted.max).toBe(Math.round(base.max * 1.1));
  });

  it('Eviscerate R3 no escala con arma: rango plano 30-40', () => {
    const ability = ROGUE.abilities.find(a => a.id === 'eviscerate')!;
    const { min, max } = engine.damage(state, ability, 3)!;
    expect(min).toBe(30);
    expect(max).toBe(40);
  });

  it('Backstab (weaponMultiplier 1.5) y Opportunity 3/4: +9% ', () => {
    const ability = ROGUE.abilities.find(a => a.id === 'backstab')!;
    const { min } = engine.damage(state, ability, 1)!;
    const base = Math.round(weaponDmg * 1.5) + apBonus + (ability.bonusPerRank![0]);
    expect(min).toBe(Math.round(Math.round(base * 0.5) * 1.0));
    const st = rogueState({ mainHandDamage: 28, offHandDamage: 22, talents: { opportunity: 3 } });
    expect(engine.damage(st, ability, 1)!.min).toBe(Math.round(Math.round(base * 0.5) * 1.09));
  });

  it('Garrote R1 DoT: total 160 sobre 4 turnos = 40/tick', () => {
    const ability = ROGUE.abilities.find(a => a.id === 'garrote')!;
    const dot = engine.dot(state, ability, 1)!;
    expect(dot.dotTotal).toBe(160);
    expect(dot.dotDuration).toBe(4);
    expect(dot.dotTick).toBe(40);
  });

  it('Garrote con Opportunity 4/4: +12% al DoT total', () => {
    const st = rogueState({ mainHandDamage: 28, offHandDamage: 22, talents: { opportunity: 4 } });
    const ability = ROGUE.abilities.find(a => a.id === 'garrote')!;
    expect(engine.dot(st, ability, 1)!.dotTotal).toBe(Math.round(160 * 1.12));
  });
});

describe('Rogue costes de energía', () => {
  const state = rogueState();

  it('coste base eviscerate = 35', () => {
    const ability = ROGUE.abilities.find(a => a.id === 'eviscerate')!;
    expect(engine.resourceCost(state, ability, 1)).toBe(35);
  });

  it('Ruthlessness 3/3: -12 a eviscerate = 23', () => {
    const st = rogueState({ talents: { ruthlessness: 3 } });
    const ability = ROGUE.abilities.find(a => a.id === 'eviscerate')!;
    expect(engine.resourceCost(st, ability, 1)).toBe(23);
  });

  it('Improved Backstab 2/2: -6 a backstab = 54', () => {
    const st = rogueState({ talents: { improved_backstab: 2 } });
    const ability = ROGUE.abilities.find(a => a.id === 'backstab')!;
    expect(engine.resourceCost(st, ability, 1)).toBe(54);
  });

  it('Initiative 1/4: -3 a sinister strike = 37', () => {
    const st = rogueState({ talents: { initiative: 1 } });
    const ability = ROGUE.abilities.find(a => a.id === 'sinister_strike')!;
    expect(engine.resourceCost(st, ability, 1)).toBe(37);
  });
});

describe('Rogue crit físco', () => {
  const state = rogueState({ mainHandDamage: 28, offHandDamage: 22 });
  const agi = 25 + Math.floor(9 * 2.2);
  const baseMeleeCrit = 5 + agi / 20 + 10 * 0.02;

  it('Precision 3/3: +6% melee crit', () => {
    const st = rogueState({ mainHandDamage: 28, offHandDamage: 22, talents: { precision: 3 } });
    const ability = ROGUE.abilities.find(a => a.id === 'sinister_strike')!;
    expect(engine.crit(st, ability)).toBeCloseTo(baseMeleeCrit + 6, 5);
  });

  it('Basic Attack físico usa meleeCrit (agilidad/20)', () => {
    const ability = ROGUE.abilities.find(a => a.id === 'basic_attack')!;
    expect(engine.crit(state, ability)).toBeCloseTo(baseMeleeCrit, 5);
  });
});

describe('Rogue data de espec completa', () => {
  it('tiene comboConfig con max 5', () => {
    expect(ROGUE.comboConfig).toEqual({ label: 'Combo Points', icon: '🗡️', max: 5 });
  });

  it('las habilidades de sigilo marcan requiresStealth', () => {
    const ambush = ROGUE.abilities.find(a => a.id === 'ambush')!;
    const garrote = ROGUE.abilities.find(a => a.id === 'garrote')!;
    expect(ambush.requiresStealth).toBe(true);
    expect(ambush.generatesCombo).toBe(2);
    expect(garrote.requiresStealth).toBe(true);
  });

  it('los 3 capstones rogue están declarados', () => {
    expect(ROGUE.capstones.map(c => c.id)).toEqual(['shadow_dance', 'blade_flurry', 'poison_mastery']);
  });
});
