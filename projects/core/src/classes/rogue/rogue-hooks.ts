import type { Ability, AfterCastOutcome, ClassHooks, CombatContext } from '../../engine/types';

export const ROGUE_HOOKS: ClassHooks = {
  afterCast(ability, ctx, result): AfterCastOutcome | null {
    const outcome: AfterCastOutcome = {};

    const finishingTouch = ctx.caster.talents['finishing_touch'] || 0;
    if (finishingTouch > 0 && ability.spendsCombo) {
      outcome.comboRecovered = 1;
      outcome.energyRecovered = 15;
    }

    const deathliness = ctx.caster.talents['deathliness'] || 0;
    if (deathliness > 0 && (ability.id === 'garrote' || ability.id === 'ambush')) {
      const cost = ability.costEnergy || 0;
      outcome.energyRecovered = (outcome.energyRecovered || 0) + Math.floor(cost * 0.2 + Math.random() * (cost * 0.4 - cost * 0.2));
    }

    return Object.keys(outcome).length ? outcome : null;
  },
};
