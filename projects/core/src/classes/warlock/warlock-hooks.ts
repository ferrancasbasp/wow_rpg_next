import type { Ability, AfterCastOutcome, ClassHooks, CombatContext } from '../../engine/types';

function soulConduitRecovery(ctx: CombatContext, shardCount: number): number {
  const rank = ctx.caster.talents['soul_conduit'] || 0;
  if (rank <= 0 || shardCount <= 0) return 0;
  let recovered = 0;
  for (let i = 0; i < shardCount; i++) {
    if (Math.random() * 100 < rank * 20) recovered++;
  }
  return recovered;
}

export const WARLOCK_HOOKS: ClassHooks = {
  resolveAbility(ability, ctx) {
    const backdraft = ctx.caster.talents['backdraft'] || 0;
    if (ability.id === 'immolate' && backdraft > 0) {
      return { forceInstant: true };
    }
    return null;
  },

  afterCast(ability, ctx, result): AfterCastOutcome | null {
    const outcome: AfterCastOutcome = {};

    const improvedDrainLife = ctx.caster.talents['improved_drain_life'] || 0;
    if (ability.lifestealPct && improvedDrainLife > 0) {
      const extraHeal = Math.round(result.roll * ability.lifestealPct * improvedDrainLife * 0.1);
      if (extraHeal > 0) outcome.extraHeal = (outcome.extraHeal || 0) + extraHeal;
    }

    const soulLeech = ctx.caster.talents['soul_leech'] || 0;
    if (soulLeech > 0 && (ability.id === 'shadow_bolt' || ability.id === 'chaos_bolt')) {
      const leechHeal = Math.round(result.roll * soulLeech * 0.1);
      if (leechHeal > 0) outcome.extraHeal = (outcome.extraHeal || 0) + leechHeal;
    }

    if (ability.spendsShards && ability.id !== 'summon_voidwalker' && ability.id !== 'summon_infernal') {
      const recovered = soulConduitRecovery(ctx, ability.shardCost || 0);
      if (recovered > 0) outcome.shardsRecovered = recovered;
    }

    return Object.keys(outcome).length ? outcome : null;
  },
};

export function baseLifestealHeal(roll: number, lifestealPct: number, improvedDrainLifeRank: number): number {
  return Math.round(roll * lifestealPct * (1 + improvedDrainLifeRank * 0.1));
}
