import { finalStats, maxHP, maxMana, spellCrit, spellPower } from './formulas';
import { resolveModifiers } from './modifiers';
import type { Ability, ActiveEffect, ClassSpec, CombatContext, Stats } from './types';

export interface CharacterState {
  level: number;
  baseStats: Stats;
  gear?: Partial<Stats>;
  effects: ActiveEffect[];
  talents: Record<string, number>;
  soulShards?: number;
  weaponDamage?: number;
  rangedDamage?: number;
  mainHandDamage?: number;
  offHandDamage?: number;
  capstone?: string;
  petId?: string;
}

export interface ResolvedDamage {
  min: number;
  max: number;
}

export interface ResolvedDot {
  dotTick: number;
  dotTotal: number;
  dotDuration: number;
}

export interface CombatEngine {
  stats(state: CharacterState): Stats;
  maxHp(state: CharacterState): number;
  maxMana(state: CharacterState): number;
  spellPower(state: CharacterState): number;
  attackPower(state: CharacterState): number;
  crit(state: CharacterState, ability: Ability, ctx?: CombatContext): number;
  meleeCrit(state: CharacterState): number;
  damage(state: CharacterState, ability: Ability, rank: number, ctx?: CombatContext): ResolvedDamage | null;
  dot(state: CharacterState, ability: Ability, rank: number, ctx?: CombatContext): ResolvedDot | null;
  energyRegen(state: CharacterState): number;
  resourceMax(state: CharacterState): number;
  resourceCost(state: CharacterState, ability: Ability, rank: number, ctx?: CombatContext): number;
  focusGain(state: CharacterState, ability: Ability): number;
}

function spBonus(ability: Ability, sp: number): number {
  if (ability.usesWeaponDamage) return 0;
  const isPhysical = ability.damageType === 'physical';
  if (isPhysical && !ability.spellPowerRatio) return 0;
  const ratio = ability.spellPowerRatio || 0;
  const healMult = ability.type === 'heal' ? 1.5 : 1;
  return Math.round(sp * ratio * healMult);
}

function effectFlat(target: string, effects: ActiveEffect[] | undefined): number {
  return (effects || []).reduce((acc, e) => {
    if (e.type === 'buff' && (e.target === target || e.target === 'all_stats')) return acc + (e.value || 0);
    if (e.type === 'debuff' && (e.target === target || e.target === 'all_stats')) return acc - (e.value || 0);
    return acc;
  }, 0);
}

function effectPercent(target: string, effects: ActiveEffect[] | undefined): number {
  return (effects || []).reduce((acc, e) => {
    if (e.type === 'buff' && e.target === target && e.isPercent) return acc + (e.value || 0);
    return acc;
  }, 0);
}

/** Reproduce totalWeaponDamage de prod según la clase. */
function totalWeaponDamage(state: CharacterState, cls: ClassSpec): number {
  if (cls.key === 'hunter') return state.rangedDamage || 0;
  return state.weaponDamage ?? (state.mainHandDamage || 0) + (state.offHandDamage || 0);
}

function isPhysical(ability: Ability): boolean {
  return ability.damageType === 'physical' || ability.usesWeaponDamage === true;
}

export function createCombatEngine(cls: ClassSpec): CombatEngine {
  return {
    stats(state) {
      return finalStats({
        level: state.level,
        baseStats: state.baseStats,
        statGrowth: cls.statGrowth,
        gearBonus: state.gear,
      });
    },
    maxHp(state) {
      const stats = this.stats(state);
      return maxHP({
        classKey: cls.key,
        level: state.level,
        stats,
        effects: state.effects,
        talents: state.talents,
        hpFormula: cls.formulas.hp,
      });
    },
    maxMana(state) {
      const stats = this.stats(state);
      return maxMana({
        stats,
        level: state.level,
        manaFormula: cls.formulas.mana,
      });
    },
    spellPower(state) {
      const stats = this.stats(state);
      return spellPower({
        stats,
        effects: state.effects,
        spFormula: cls.formulas.spellPower,
      });
    },
    meleeCrit(state) {
      const stats = this.stats(state);
      const fromAgi = stats.agilidad / 20;
      const fromLevel = state.level * 0.02;
      const fromBuff = effectFlat('physCrit', state.effects);
      const fromReckless = (state.effects || []).some(e => e.target === 'recklessness') ? 30 : 0;
      return 5 + fromAgi + fromLevel + fromBuff + fromReckless;
    },
    crit(state, ability, ctx) {
      const mods = resolveModifiers(cls.talents, state.talents, ability, ctx);
      if (isPhysical(ability)) {
        return this.meleeCrit(state) + mods.meleeCritChanceFlat + mods.critChanceFlat;
      }
      const base = spellCrit({ stats: this.stats(state), level: state.level, effects: state.effects });
      return base + mods.critChanceFlat;
    },
    attackPower(state) {
      let total = cls.formulas.attackPower(this.stats(state));
      total += effectFlat('attackPower', state.effects);
      for (const eff of state.effects || []) {
        if (eff.type === 'buff' && eff.target === 'attackPower' && eff.isPercent) {
          total = Math.round(total * (1 + (eff.value || 0) / 100));
        }
      }
      for (const eff of state.effects || []) {
        if (eff.type === 'buff' && eff.target === 'bloodlust') {
          total = Math.round(total * 1.2);
        }
      }
      return total;
    },
    energyRegen(state) {
      const base = cls.resource.regen ?? 20;
      const mods = resolveModifiers(cls.talents, state.talents, {} as Ability, undefined);
      let regen = base > 0 ? Math.round(base * (1 + mods.energyRegenPct / 100)) : 0;
      if ((state.effects || []).some(e => e.target === 'blade_flurry')) regen += 10;
      return regen;
    },
    resourceMax(state) {
      if (cls.resource.type === 'mana') return this.maxMana(state);
      const base = cls.resource.max || 100;
      if (cls.resource.type === 'energy' && state.capstone === 'shadow_dance') return base + 20;
      return base;
    },
    resourceCost(state, ability, rank, ctx) {
      const buffRank = ability.buffRanks?.find(br => br.rank === rank);
      const mods = resolveModifiers(cls.talents, state.talents, ability, ctx);
      if (cls.resource.type === 'energy') {
        const base = buffRank ? (buffRank.costEnergy ?? ability.costEnergy ?? 0) : (ability.costEnergy || 0);
        return Math.max(0, base + mods.energyCostFlat);
      }
      if (cls.resource.type === 'focus') {
        const base = buffRank ? (buffRank.costFocus ?? ability.costFocus ?? 0) : (ability.costFocus || 0);
        return Math.max(0, base + mods.focusCostFlat);
      }
      if (cls.resource.type === 'rage') {
        const base = buffRank ? (buffRank.costRage ?? ability.costRage ?? 0) : (ability.costRage || 0);
        return Math.max(0, base);
      }
      const base = (buffRank ? buffRank.costPct ?? ability.costPct : ability.costPct) || 0;
      const manaMult = 1 + (mods.manaCostPct + effectPercent('manaCost', state.effects)) / 100;
      return Math.max(0, Math.round(base * this.maxMana(state) * manaMult));
    },
    focusGain(state, ability) {
      return ability.focusGain || 0;
    },
    damage(state, ability, rank, ctx) {
      const mods = resolveModifiers(cls.talents, state.talents, ability, ctx);
      const hook = ctx ? cls.hooks?.resolveAbility?.(ability, ctx) : null;
      const { baseMin, baseMax } = baseDamage(state, ability, rank, this, cls);
      if (baseMin === null) return null;
      const mult = 1 + mods.damagePct / 100 + (hook?.directBonusPct || 0) / 100;
      const directMult = 1 + mods.directDamagePct / 100;
      return {
        min: Math.round(Math.round(baseMin * mult) * directMult),
        max: Math.round(Math.round(baseMax! * mult) * directMult),
      };
    },
    dot(state, ability, rank, ctx) {
      const mods = resolveModifiers(cls.talents, state.talents, ability, ctx);
      const { baseMin } = baseDamage(state, ability, rank, this, cls);
      if (baseMin === null) return null;
      const baseDotDuration = ability.dotDuration || 1;
      const dotMaster = state.talents['dot_master'] || 0;
      const dotHooks = ctx ? cls.hooks?.resolveAbility?.(ability, ctx) : null;
      let dotTotal = Math.round(baseMin * (1 + mods.damagePct / 100 + (dotHooks?.directBonusPct || 0) / 100));
      if (mods.dotDamagePct > 0) dotTotal = Math.round(dotTotal * (1 + mods.dotDamagePct / 100));
      const dotTick = Math.round(dotTotal / baseDotDuration);
      return { dotTick, dotTotal, dotDuration: baseDotDuration + dotMaster };
    },
  };
}

/** Resolución base (pre-modifiers) de una habilidad, réplica de prod `unlockedAbilities`. */
function baseDamage(
  state: CharacterState,
  ability: Ability,
  rank: number,
  engine: Pick<CombatEngine, 'spellPower' | 'attackPower'>,
  cls: ClassSpec,
): { baseMin: number | null; baseMax: number | null } {
  const sp = engine.spellPower(state);
  const weaponDmg = totalWeaponDamage(state, cls);
  const apBonus = Math.round(engine.attackPower(state) / 7);

  if (ability.usesWeaponDamage) {
    const base = weaponDmg + apBonus + (ability.baseDamage || 0);
    return { baseMin: Math.round(base * 0.5), baseMax: Math.round(base * 1.5) };
  }
  if (ability.bonusPerRank) {
    const wmult = ability.weaponMultiplier || 1.0;
    const bonus = ability.bonusPerRank[rank - 1] || 0;
    const base = Math.round(weaponDmg * wmult) + apBonus + bonus;
    return { baseMin: Math.round(base * 0.5), baseMax: Math.round(base * 1.5) };
  }
  const dmgRange = ability.damageRanges?.find(dr => dr.rank === rank);
  if (!dmgRange) return { baseMin: null, baseMax: null };
  const phys = isPhysical(ability);
  const weaponMult = ability.weaponMultiplier || 0;
  const meleeWeaponBonus = phys && weaponMult > 0 ? weaponDmg * weaponMult + apBonus : 0;
  const isArcan = ability.id === 'arcanic_shot';
  const bowBonus = isArcan ? Math.round((weaponDmg + apBonus) * 0.5) : 0;
  const flatMult = isArcan ? 0.5 : 1;
  const spellBonus = phys ? 0 : spBonus(ability, sp);
  const min = Math.round(dmgRange.min * flatMult + meleeWeaponBonus + bowBonus + spellBonus);
  const max = Math.round(dmgRange.max * flatMult + meleeWeaponBonus + bowBonus + spellBonus);
  return { baseMin: min, baseMax: max };
}
