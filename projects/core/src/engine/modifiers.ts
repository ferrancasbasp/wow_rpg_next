import { abilityMatches } from './registry';
import type { Ability, CombatContext, Condition, ModifierStat, Talent } from './types';

export interface ModifierResolution {
  damagePct: number;
  dotDamagePct: number;
  dotDurationFlat: number;
  directDamagePct: number;
  critChanceFlat: number;
  critDamagePct: number;
  spellPowerPct: number;
  maxHpPct: number;
  maxShardsFlat: number;
  manaCostPct: number;
  energyCostFlat: number;
  focusCostFlat: number;
  energyRegenPct: number;
  weaponDamageFlat: number;
  attackPowerFlat: number;
  meleeCritChanceFlat: number;
  buffDurationFlat: number;
}

export function emptyResolution(): ModifierResolution {
  return {
    damagePct: 0,
    dotDamagePct: 0,
    dotDurationFlat: 0,
    directDamagePct: 0,
    critChanceFlat: 0,
    critDamagePct: 0,
    spellPowerPct: 0,
    maxHpPct: 0,
    maxShardsFlat: 0,
    manaCostPct: 0,
    energyCostFlat: 0,
    focusCostFlat: 0,
    energyRegenPct: 0,
    weaponDamageFlat: 0,
    attackPowerFlat: 0,
    meleeCritChanceFlat: 0,
    buffDurationFlat: 0,
  };
}

const STAT_FIELDS: Record<ModifierStat, keyof ModifierResolution> = {
  damage: 'damagePct',
  dotDamage: 'dotDamagePct',
  dotDuration: 'dotDurationFlat',
  directDamage: 'directDamagePct',
  critChance: 'critChanceFlat',
  critDamage: 'critDamagePct',
  spellPower: 'spellPowerPct',
  maxHP: 'maxHpPct',
  maxShards: 'maxShardsFlat',
  manaCost: 'manaCostPct',
  energyCost: 'energyCostFlat',
  focusCost: 'focusCostFlat',
  energyRegen: 'energyRegenPct',
  weaponDamage: 'weaponDamageFlat',
  attackPower: 'attackPowerFlat',
  meleeCritChance: 'meleeCritChanceFlat',
  buffDuration: 'buffDurationFlat',
};

export function evalCondition(cond: Condition, ctx: CombatContext): boolean {
  const t = ctx.target;
  if (!t) return false;
  switch (cond.kind) {
    case 'always':
      return true;
    case 'targetHpBelowPct':
      return t.hpPct < cond.pct;
    case 'targetHpAbovePct':
      return t.hpPct > cond.pct;
    case 'targetHasDot':
      return t.activeEffects.some(e => e.type === 'dot');
    case 'targetHasEffect':
      return t.activeEffects.some(e => e.name === cond.name);
    case 'targetArmorBelow':
      return t.armor < cond.value;
    case 'casterHasEffect':
      return ctx.caster.effects.some(e => e.name === cond.name);
    case 'casterIsStealthed':
      return !!ctx.caster.stealth;
    default:
      return false;
  }
}

export function conditionsMet(mods: { conditions?: Condition[] }, ctx?: CombatContext): boolean {
  if (!mods.conditions) return true;
  if (!ctx) return false;
  return mods.conditions.every(c => evalCondition(c, ctx));
}

export function resolveModifiers(
  talents: Talent[],
  ranks: Record<string, number>,
  ability: Ability,
  ctx?: CombatContext,
): ModifierResolution {
  const res = emptyResolution();
  for (const talent of talents) {
    const rank = ranks[talent.id] || 0;
    if (rank <= 0) continue;
    for (const mod of talent.modifiers) {
      if (!abilityMatches(ability, mod.target)) continue;
      if (!conditionsMet(mod, ctx)) continue;
      const field = STAT_FIELDS[mod.stat];
      res[field] += mod.valuePerRank * rank;
    }
  }
  return res;
}

export function aggregatePct(res: ModifierResolution, field: keyof ModifierResolution): number {
  return res[field];
}

export function pctMultiplier(value: number): number {
  return 1 + value / 100;
}
