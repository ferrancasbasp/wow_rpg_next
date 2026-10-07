import type { StatKey, Stats } from './types';

export const STAT_KEYS: StatKey[] = ['fuerza', 'agilidad', 'intelecto', 'aguante', 'espiritu'];

export interface EffectsInput {
  type: 'buff' | 'debuff' | 'hot' | 'dot' | 'status' | 'misc';
  target?: string;
  isPercent?: boolean;
  value?: number;
}

export interface DerivedStatsInput {
  level: number;
  baseStats: Stats;
  statGrowth: Partial<Stats>;
  gearBonus?: Partial<Stats>;
  effectBonus?: Partial<Stats>;
  effects?: EffectsInput[];
  talents: Record<string, number>;
  capstone?: string;
  classKey: string;
  soulShards?: number;
}

export function finalStats(input: {
  level: number;
  baseStats: Stats;
  statGrowth: Partial<Stats>;
  gearBonus?: Partial<Stats>;
  effectBonus?: Partial<Stats>;
}): Stats {
  const result = {} as Stats;
  for (const key of STAT_KEYS) {
    result[key] =
      (input.baseStats[key] || 0) +
      Math.floor((input.level - 1) * (input.statGrowth[key] || 0)) +
      (input.gearBonus?.[key] || 0) +
      (input.effectBonus?.[key] || 0);
  }
  return result;
}

export function hasBuffNamed(effects: EffectsInput[] | undefined, name: string): boolean {
  return (effects || []).some(e => e.type === 'buff' && e.target === name);
}

export function effectFlat(target: string, gearBonus: Partial<Stats> | undefined, effects: EffectsInput[] | undefined): number {
  return (gearBonus?.[target as StatKey] || 0) + (effects || []).reduce((acc, e) => {
    if (e.type === 'buff' && (e.target === target || e.target === 'all_stats') && !e.isPercent) return acc + (e.value || 0);
    if (e.type === 'debuff' && (e.target === target || e.target === 'all_stats') && !e.isPercent) return acc - (e.value || 0);
    return acc;
  }, 0);
}

export function effectPctSum(target: string, effects: EffectsInput[] | undefined): number {
  return (effects || []).reduce((acc, e) => {
    if (e.type === 'buff' && e.target === target && e.isPercent) return acc + (e.value || 0);
    return acc;
  }, 0);
}

/**
 * HP máximo. Reproduce:
 *  round(formulas.hp(finalStats, level))
 *  → buffs target 'maxHP' (pct *= 1+value/100, flat += value)
 *  → demonic_embrace: si Fel Armor activo, ×(1 + rank×0.10)
 */
export function maxHP(input: {
  classKey: string;
  level: number;
  stats: Stats;
  effects?: EffectsInput[];
  talents: Record<string, number>;
  hpFormula: (stats: Stats, level: number) => number;
}): number {
  let hp = Math.round(input.hpFormula(input.stats, input.level));
  const buffs = input.effects?.filter(e => e.type === 'buff' && e.target === 'maxHP') || [];
  for (const b of buffs) {
    if (b.isPercent) hp = Math.round(hp * (1 + (b.value || 0) / 100));
    else hp += (b.value || 0);
  }
  const demonicEmbrace = input.talents['demonic_embrace'] || 0;
  if (demonicEmbrace > 0 && hasBuffNamed(input.effects, 'Fel Armor')) {
    hp = Math.round(hp * (1 + demonicEmbrace * 0.1));
  }
  return hp;
}

export function maxMana(input: {
  stats: Stats;
  level: number;
  manaFormula: (stats: Stats, level: number) => number;
}): number {
  return Math.round(input.manaFormula(input.stats, input.level));
}

/**
 * Spell Power. Reproduce:
 *  base = round(formulas.spellPower(stats))
 *  + flats target 'spellPower' (equipo o buffs)
 *  luego cada buff target 'spellPower' isPercent → ×(1+value/100) en cadena
 */
export function spellPower(input: {
  stats: Stats;
  effects?: EffectsInput[];
  spFormula: (stats: Stats) => number;
}): number {
  let sp = Math.round(input.spFormula(input.stats));
  sp += effectFlat('spellPower', undefined, input.effects);
  for (const eff of input.effects || []) {
    if (eff.type === 'buff' && eff.target === 'spellPower' && eff.isPercent) {
    sp = Math.round(sp * (1 + (eff.value || 0) / 100));
    }
  }
  return sp;
}

/**
 * Probabilidad de crítico de hechizo. Reproduce:
 *  5 + intelecto/60 + nivel×0.02 + flats target 'spellCrit'
 */
export function spellCrit(input: {
  stats: Stats;
  level: number;
  effects?: EffectsInput[];
}): number {
  const fromInt = input.stats.intelecto / 60;
  const fromLevel = input.level * 0.02;
  const fromBuff = effectFlat('spellCrit', undefined, input.effects);
  return 5 + fromInt + fromLevel + fromBuff;
}
