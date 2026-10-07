export interface CombatEnemyEffect {
  id: string;
  name: string;
  type: 'dot' | 'debuff' | 'buff' | 'status';
  school?: string;
  turnsLeft: number;
  value?: number;
  target?: string;
  source?: 'master' | 'player';
}

export interface CombatEnemy {
  npcId: string;
  name: string;
  iconImg: string;
  level: number;
  maxHP: number;
  currentHP: number;
  armor: number;
  magicResist: number;
  zone?: string;
  isElite?: boolean;
  effects: CombatEnemyEffect[];
}

export interface CombatLogEntry {
  id: string;
  ts: number;
  text: string;
}

export interface CombatEncounter {
  active: boolean;
  turn: number;
  enemy: CombatEnemy | null;
  updatedAt: number;
  log: CombatLogEntry[];
}
