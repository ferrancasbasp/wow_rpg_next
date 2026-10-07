import type { Ability, ClassHooks, CombatContext } from '../../engine/types';

export const MAGE_HOOKS: ClassHooks = {
  resolveAbility(ability: Ability, ctx: CombatContext) {
    const icyVeins = ctx.caster.effects.some(e => e.name === 'Icy Veins');
    if (icyVeins && ability.castType === 'cast' && (ability.school === 'Escarcha' || ability.id === 'frostbolt')) {
      return { forceInstant: true };
    }
    return null;
  },
};
