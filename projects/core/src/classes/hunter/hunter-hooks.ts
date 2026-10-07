import type { Ability, ClassHooks, CombatContext } from '../../engine/types';

export const HUNTER_HOOKS: ClassHooks = {
  resolveAbility(ability: Ability, ctx: CombatContext) {
    const lockAndLoad = ctx.caster.talents['lock_and_load'] || 0;
    const ready = ctx.caster.effects.some(e => e.name === 'Lock and Load');
    if (lockAndLoad > 0 && ability.id === 'aimed_shot' && ready) {
      return { forceInstant: true };
    }
    return null;
  },
};
