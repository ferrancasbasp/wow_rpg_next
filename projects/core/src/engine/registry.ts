import type { Ability } from './types';

export class ClassRegistry {
  private specs = new Map<string, unknown>();

  register(key: string, spec: unknown): void {
    this.specs.set(key, spec);
  }

  getSpec<T>(key: string): T | undefined {
    return this.specs.get(key) as T | undefined;
  }

  keys(): string[] {
    return [...this.specs.keys()];
  }
}

export function abilityMatches(ability: Ability, target: string): boolean {
  if (target === '*') return true;
  if (target.startsWith('ability:')) {
    return target
      .slice('ability:'.length)
      .split('|')
      .includes(ability.id);
  }
  if (target.startsWith('tag:')) {
    const tags = target.slice('tag:'.length).split('|');
    return (ability.tags || []).some(t => tags.includes(t));
  }
  return false;
}
