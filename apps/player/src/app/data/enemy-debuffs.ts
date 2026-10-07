import type { CombatEnemyEffect } from '../models/combat';

export interface EnemyDebuffSpec {
  name: string;
  type: CombatEnemyEffect['type'];
  school: string;
  duration: number;
  value: number;
  target?: string;
  description: string;
}

export const ENEMY_DEBUFFS: EnemyDebuffSpec[] = [
  { name: 'Corruption', type: 'debuff', school: 'Sombras', duration: 4, value: 0, description: 'Debuff de Sombras. Dispara sinergias del jugador (p. ej. Shadow Bolt +daño contra objetivos con Corruption).' },
  { name: 'Sangrado', type: 'dot', school: 'Físico', duration: 4, value: 25, target: 'hp', description: 'DoT físico: 25/turno durante 4 turnos.' },
  { name: 'Quemadura', type: 'dot', school: 'Fuego', duration: 3, value: 40, target: 'hp', description: 'DoT de fuego: 40/turno durante 3 turnos.' },
  { name: 'Maldición', type: 'debuff', school: 'Maldiciones', duration: 4, value: 0, description: 'Debuff de Maldiciones sobre el objetivo.' },
  { name: 'Ralentizado', type: 'status', school: 'Escarcha', duration: 2, value: 0, target: 'slowed', description: 'Estado de escarcha: el objetivo actúa después.' },
];
