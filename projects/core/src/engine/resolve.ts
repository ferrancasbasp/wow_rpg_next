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
  crit(state: CharacterState, ability: Ability, ctx?: CombatContext): number;
  damage(state: CharacterState, ability: Ability, rank: number, ctx?: CombatContext): ResolvedDamage | null;
  dot(state: CharacterState, ability: Ability, rank: number, ctx?: CombatContext): ResolvedDot | null;
}

function spBonus(ability: Ability, sp: number): number {
  if (ability.usesWeaponDamage) return 0;
  const isPhysical = ability.damageType === 'physical';
  if (isPhysical && !ability.spellPowerRatio) return 0;
  const ratio = ability.spellPowerRatio || 0;
  const healMult = ability.type === 'heal' ? 1.5 : 1;
  return Math.round(sp * ratio * healMult);
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
    crit(state, ability, ctx) {
      const stats = this.stats(state);
      const base = spellCrit({ stats, level: state.level, effects: state.effects });
      const mods = resolveModifiers(cls.talents, state.talents, ability, ctx);
      return base + mods.critChanceFlat;
    },
    damage(state, ability, rank, ctx) {
      const dmgRange = ability.damageRanges?.find(dr => dr.rank === rank);
      if (!dmgRange) return null;
      const sp = this.spellPower(state);
      const mods = resolveModifiers(cls.talents, state.talents, ability, ctx);
      const hook = ctx ? cls.hooks?.resolveAbility?.(ability, ctx) : null;
      const baseMin = (dmgRange.min || 0) + spBonus(ability, sp);
      const baseMax = (dmgRange.max || 0) + spBonus(ability, sp);
      const mult = 1 + mods.damagePct / 100 + (hook?.directBonusPct || 0) / 100;
      const directMult = 1 + mods.directDamagePct / 100;
      return {
        min: Math.round(Math.round(baseMin * mult) * directMult),
        max: Math.round(Math.round(baseMax * mult) * directMult),
      };
    },
    dot(state, ability, rank, ctx) {
      const dmgRange = ability.damageRanges?.find(dr => dr.rank === rank);
      if (!dmgRange) return null;
      const baseDotDuration = ability.dotDuration || 1;
      const dotMaster = state.talents['dot_master'] || 0;
      const mods = resolveModifiers(cls.talents, state.talents, ability, ctx);
      const sp = this.spellPower(state);
      let dotTotal = (dmgRange.min || 0) + spBonus(ability, sp);
      if (mods.dotDamagePct > 0) dotTotal = Math.round(dotTotal * (1 + mods.dotDamagePct / 100));
      const dotTick = Math.round(dotTotal / baseDotDuration);
      return { dotTick, dotTotal, dotDuration: baseDotDuration + dotMaster };
    },
  };
}
