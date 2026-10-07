import { describe, expect, it } from 'vitest';
import { createCombatEngine } from '../../engine/resolve';
import { resolveModifiers } from '../../engine/modifiers';
import { MAGE } from './mage';

const engine = createCombatEngine(MAGE);

function mageState(overrides: Record<string, unknown> = {}) {
  return {
    level: 10,
    baseStats: MAGE.baseStats,
    effects: [],
    talents: {},
    gear: {},
    ...overrides,
  };
}

describe('Mage stats de paridad (nivel 10, sin equipo)', () => {
  const state = mageState();

  it('finalStats = base + floor((level-1) * growth)', () => {
    expect(engine.stats(state)).toEqual({
      fuerza: 3 + Math.floor(9 * 0.1),
      agilidad: 3 + Math.floor(9 * 0.1),
      intelecto: 20 + Math.floor(9 * 2.0),
      aguante: 14 + Math.floor(9 * 0.7),
      espiritu: 18 + Math.floor(9 * 1.1),
    });
  });

  it('maxHP = round(30 + aguante*8 + lvl*4)', () => {
    const aguante = 14 + Math.floor(9 * 0.7);
    expect(engine.maxHp(state)).toBe(Math.round(30 + aguante * 8 + 10 * 4));
  });

  it('maxMana = round(50 + intelecto*15 + lvl*5)', () => {
    const inte = 20 + Math.floor(9 * 2.0);
    expect(engine.maxMana(state)).toBe(Math.round(50 + inte * 15 + 10 * 5));
  });

  it('spellPower = round(intelecto * 0.65)', () => {
    const inte = 20 + Math.floor(9 * 2.0);
    expect(engine.spellPower(state)).toBe(Math.round(inte * 0.65));
  });

  it('resourceMax = maxMana', () => {
    expect(engine.resourceMax(state)).toBe(engine.maxMana(state));
  });

  it('spellCrit = 5 + inte/60 + nivel*0.02', () => {
    const inte = 20 + Math.floor(9 * 2.0);
    expect(engine.crit(state, MAGE.abilities.find(a => a.id === 'fireball')!)).toBeCloseTo(5 + inte / 60 + 10 * 0.02, 5);
  });
});

describe('Mage daño por hechizo (nivel 10, sin equipo)', () => {
  const state = mageState();
  const sp = Math.round((20 + Math.floor(9 * 2.0)) * 0.65);

  it('Fireball R2 (magical): rango + spellPower*ratio 1.0', () => {
    const ability = MAGE.abilities.find(a => a.id === 'fireball')!;
    const { min, max } = engine.damage(state, ability, 2)!;
    const range = ability.damageRanges!.find(dr => dr.rank === 2)!;
    expect(min).toBe(range.min + sp);
    expect(max).toBe(range.max + sp);
  });

  it('Fire Blast R2: rango + spellPower*0.8', () => {
    const ability = MAGE.abilities.find(a => a.id === 'fire_blast')!;
    const { min, max } = engine.damage(state, ability, 2)!;
    const range = ability.damageRanges!.find(dr => dr.rank === 2)!;
    const bonus = Math.round(sp * 0.8);
    expect(min).toBe(range.min + bonus);
    expect(max).toBe(range.max + bonus);
  });

  it('Improved Frostbolt 3/3: +30% a Frostbolt', () => {
    const st = mageState({ talents: { improved_frostbolt: 3 } });
    const ability = MAGE.abilities.find(a => a.id === 'frostbolt')!;
    const base = engine.damage(state, ability, 1)!;
    const boosted = engine.damage(st, ability, 1)!;
    expect(boosted.min).toBe(Math.round(base.min * 1.3));
    expect(boosted.max).toBe(Math.round(base.max * 1.3));
  });

  it('Elemental Mastery 4/4: +10% a todos los hechizos', () => {
    const st = mageState({ talents: { elemental_mastery: 4 } });
    const ability = MAGE.abilities.find(a => a.id === 'fire_blast')!;
    const base = engine.damage(state, ability, 2)!;
    const boosted = engine.damage(st, ability, 2)!;
    expect(boosted.min).toBe(Math.round(base.min * 1.1));
    expect(boosted.max).toBe(Math.round(base.max * 1.1));
  });

  it('Casting Master 3/3: +15% a Fireball (cast)', () => {
    const st = mageState({ talents: { casting_master: 3 } });
    const ability = MAGE.abilities.find(a => a.id === 'fireball')!;
    const base = engine.damage(state, ability, 2)!;
    const boosted = engine.damage(st, ability, 2)!;
    expect(boosted.min).toBe(Math.round(base.min * 1.15));
    expect(boosted.max).toBe(Math.round(base.max * 1.15));
  });

  it('Casting Master NO afecta a Fire Blast (instant)', () => {
    const st = mageState({ talents: { casting_master: 3 } });
    const ability = MAGE.abilities.find(a => a.id === 'fire_blast')!;
    expect(engine.damage(st, ability, 2)).toEqual(engine.damage(state, ability, 2));
  });
});

describe('Mage mana', () => {
  const state = mageState();

  it('Fireball R2 coste = round(0.0909 * maxMana)', () => {
    const ability = MAGE.abilities.find(a => a.id === 'fireball')!;
    expect(engine.resourceCost(state, ability, 2)).toBe(Math.round(0.0909 * engine.maxMana(state)));
  });

  it('Casting Master 3/3: -15% coste en cast (Fireball)', () => {
    const st = mageState({ talents: { casting_master: 3 } });
    const ability = MAGE.abilities.find(a => a.id === 'fireball')!;
    expect(engine.resourceCost(st, ability, 2)).toBe(
      Math.max(0, Math.round(0.0909 * engine.maxMana(st) * 0.85)),
    );
  });

  it('Casting Master no reduce el coste de instants', () => {
    const st = mageState({ talents: { casting_master: 3 } });
    const ability = MAGE.abilities.find(a => a.id === 'fire_blast')!;
    expect(engine.resourceCost(st, ability, 2)).toBe(engine.resourceCost(state, ability, 2));
  });

  it('Arcane Torrent 3/3: +15% coste en Arcane Missiles', () => {
    const st = mageState({ talents: { arcane_torrent: 3 } });
    const ability = MAGE.abilities.find(a => a.id === 'arcane_missiles')!;
    expect(engine.resourceCost(st, ability, 1)).toBe(
      Math.max(0, Math.round(ability.costPct * engine.maxMana(st) * 1.45)),
    );
  });
});

describe('Mage crit', () => {
  const state = mageState();

  it('Magic Resistance 3/3: +2% crit/instant en Fire Blast', () => {
    const st = mageState({ talents: { magic_resistance: 3 } });
    const fb = MAGE.abilities.find(a => a.id === 'fire_blast')!;
    const fireball = MAGE.abilities.find(a => a.id === 'fireball')!;
    const modsInstant = resolveModifiers(MAGE.talents, st.talents, fb);
    const modsCast = resolveModifiers(MAGE.talents, st.talents, fireball);
    expect(modsInstant.critChanceFlat).toBe(6);
    expect(modsCast.critChanceFlat).toBe(0);
  });

  it('Improved Fire Blast 2/2: +10% crit por punto sobre Fire Blast', () => {
    const st = mageState({ talents: { improved_fire_blast: 2 } });
    const fb = MAGE.abilities.find(a => a.id === 'fire_blast')!;
    const base = engine.crit(state, fb) as number;
    const boosted = engine.crit(st, fb) as number;
    expect(boosted).toBeCloseTo(base + 20, 5);
  });

  it('Frost Power 3/3: +6% crit y +30% crit damage en Escarcha', () => {
    const st = mageState({ talents: { frost_power: 3 } });
    const frostbolt = MAGE.abilities.find(a => a.id === 'frostbolt')!;
    const fireball = MAGE.abilities.find(a => a.id === 'fireball')!;
    expect(resolveModifiers(MAGE.talents, st.talents, frostbolt).critChanceFlat).toBe(6);
    expect(resolveModifiers(MAGE.talents, st.talents, frostbolt).critDamagePct).toBe(30);
    expect(resolveModifiers(MAGE.talents, st.talents, fireball).critChanceFlat).toBe(0);
  });
});

describe('Mage hook: Icy Veins', () => {
  it('fuerza Frostbolt a instant con efecto Icy Veins activo', () => {
    const state = mageState();
    const effects = [{ id: 1, type: 'buff' as const, name: 'Icy Veins', target: 'icy_veins', value: 1, duration: 2 }];
    const ability = MAGE.abilities.find(a => a.id === 'frostbolt')!;
    const ctx = {
      caster: { level: 10, stats: engine.stats(state), talents: {}, effects, soulShards: 0 },
      target: { currentHP: 100, maxHP: 100, hpPct: 100, activeEffects: [], armor: 4, magicResist: 5 },
    };
    const res = MAGE.hooks!.resolveAbility!(ability, ctx);
    expect(res).toEqual({ forceInstant: true });
  });

  it('no fuerza instant sin el efecto ni en Fireball', () => {
    const state = mageState();
    const frostbolt = MAGE.abilities.find(a => a.id === 'frostbolt')!;
    const fireball = MAGE.abilities.find(a => a.id === 'fireball')!;
    const ctx = {
      caster: { level: 10, stats: engine.stats(state), talents: {}, effects: [], soulShards: 0 },
      target: { currentHP: 100, maxHP: 100, hpPct: 100, activeEffects: [], armor: 4, magicResist: 5 },
    };
    expect(MAGE.hooks!.resolveAbility!(frostbolt, ctx)).toBeNull();
    expect(MAGE.hooks!.resolveAbility!(fireball, ctx)).toBeNull();
  });
});

describe('Mage data de espec completa', () => {
  it('mana_gem usa manaGemRanks con valores por rango', () => {
    const gem = MAGE.abilities.find(a => a.id === 'mana_gem')!;
    expect(gem.manaGemRanks?.map(r => r.value)).toEqual([200, 330, 470, 620, 780, 950]);
  });

  it('elemental_orbs es pasiva', () => {
    const orbs = MAGE.abilities.find(a => a.id === 'elemental_orbs')!;
    expect(orbs.passive).toBe(true);
  });

  it('los 3 capstones mage están declarados', () => {
    expect(MAGE.capstones.map(c => c.id)).toEqual(['combustion', 'icy_veins', 'arcane_power']);
    const caps = MAGE.abilities.filter(a => a.capstoneGate).map(a => a.capstoneGate);
    expect(caps).toEqual(['combustion', 'icy_veins', 'arcane_power']);
  });

  it('combustion/icy_veins/arcane_power son noGcd y con cooldown', () => {
    const cap = MAGE.abilities.filter(a => a.capstoneGate);
    expect(cap.every(a => a.noGcd)).toBe(true);
    expect(cap.map(a => a.cooldown)).toEqual([8, 6, 6]);
  });
});
