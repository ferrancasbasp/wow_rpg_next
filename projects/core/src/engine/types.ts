export type StatKey = 'fuerza' | 'agilidad' | 'intelecto' | 'aguante' | 'espiritu';

export type Stats = Record<StatKey, number>;

export type ResourceType = 'mana' | 'rage' | 'energy' | 'focus';

export type DamageType = 'physical' | 'magical';

export type CastType = 'instant' | 'cast';

export type AbilityType = 'damage' | 'heal' | 'utility';

export type AbilityTag =
  | 'dot'
  | 'shadow'
  | 'fire'
  | 'aoe'
  | 'pet'
  | 'direct'
  | 'lifesteal'
  | 'afflic'
  | 'physical'
  | 'ranged'
  | 'stealth'
  | 'sharpshooter';


export interface DamageRange {
  rank: number;
  level: number;
  min: number;
  max: number;
}

export interface DotRange {
  rank: number;
  level: number;
  value: number;
  duration: number;
}

export interface BuffRank {
  rank: number;
  level: number;
  value: number;
  costPct?: number;
  costEnergy?: number;
  costFocus?: number;
  costRage?: number;
}

export interface InflictedEffect {
  type: 'dot' | 'debuff' | 'status';
  name: string;
  value?: number;
  stat?: string;
  target?: string;
  duration: number;
  debuffType?: 'disease' | 'poison' | 'magic' | 'curse' | 'none';
  stackable?: boolean;
}

export interface Ability {
  id: string;
  name: string;
  icon: string;
  iconImg: string;
  school: string;
  type: AbilityType;
  requiredLevel: number;
  damageType?: DamageType;
  baseDamage?: number;
  spellPowerRatio?: number;
  costPct: number;
  castType: CastType;
  cooldown: number;
  description: string;
  tags?: AbilityTag[];
  damageRanges?: DamageRange[];
  dotRanges?: DotRange[];
  isDot?: boolean;
  isHot?: boolean;
  dotDuration?: number;
  hotDuration?: number;
  dotScales?: boolean;
  lifestealPct?: number;
  aoe?: boolean;
  buff?: { stat: string; duration: number; applySelf?: boolean; isPercent?: boolean } | null;
  buffRanks?: BuffRank[];
  manaGemRanks?: BuffRank[];
  inflictsEffects?: InflictedEffect[];
  generatesShard?: number;
  spendsShards?: boolean;
  shardCost?: number;
  isPetSummon?: string;
  petAbility?: string;
  noGcd?: boolean;
  capstoneGate?: string;
  partyBuff?: boolean;
  stunDuration?: number;
  infernalTurns?: number;
  infernalMin?: number;
  infernalMax?: number;
  talentGate?: string;
  requiresStealth?: boolean;
  requiresBehind?: boolean;
  usesWeaponDamage?: boolean;
  noWeaponScaling?: boolean;
  bonusPerRank?: number[];
  weaponMultiplier?: number;
  armorShred?: number[];
  passive?: boolean;
  costRage?: number;
  costEnergy?: number;
  costFocus?: number;
  energyCost?: number;
  focusGain?: number;
  rageGain?: number;
  generatesRage?: number;
  generatesCombo?: number;
  generatesComboChance?: number;
  spendsCombo?: boolean;
  healthCostPct?: number;
  destroysPet?: boolean;
}

export interface ActiveEffect {
  id: number;
  type: 'buff' | 'debuff' | 'hot' | 'dot' | 'status' | 'misc';
  name: string;
  target: string;
  value: number;
  duration: number;
  isPercent?: boolean;
  debuffType?: 'disease' | 'poison' | 'magic' | 'curse' | 'none';
  school?: string;
}

export type ModifierStat =
  | 'damage'
  | 'dotDamage'
  | 'dotDuration'
  | 'directDamage'
  | 'critChance'
  | 'critDamage'
  | 'spellPower'
  | 'maxHP'
  | 'maxShards'
  | 'manaCost'
  | 'energyCost'
  | 'focusCost'
  | 'energyRegen'
  | 'weaponDamage'
  | 'attackPower'
  | 'meleeCritChance'
  | 'buffDuration';

export type ModifierTarget = `ability:${string}` | `tag:${AbilityTag}` | string;

export interface Modifier {
  target: ModifierTarget;
  stat: ModifierStat;
  type: 'flat' | 'pct';
  valuePerRank: number;
  /** Condiciones opcionales: el modificador solo aplica si todas se cumplen. */
  conditions?: Condition[];
}

export interface Talent {
  id: string;
  name: string;
  icon: string;
  iconImg: string;
  description: string;
  maxRank: number;
  tier: number;
  requires: { id: string; points: number } | null;
  modifiers: Modifier[];
}

export interface Capstone {
  id: string;
  name: string;
  icon: string;
  iconImg: string;
  description: string;
}

export interface ResourceConfig {
  type: ResourceType;
  label: string;
  color: string;
  start: 'full' | 'empty';
  max?: number;
  regen?: number;
}

export interface ClassFormulas {
  hp: (stats: Stats, level: number) => number;
  mana: (stats: Stats, level: number) => number;
  spellPower: (stats: Stats) => number;
  attackPower: (stats: Stats) => number;
  manaRegen: (stats: Stats) => number;
}

export interface ComboConfig {
  label: string;
  icon: string;
  max: number;
}

export interface Pet {
  id: string;
  name: string;
  icon: string;
  iconImg: string;
  requiredLevel: number;
  hpPct: number;
  manaPct: number;
  attackName: string;
  attackMin: number;
  attackMax: number;
  attackSchool: string;
  manaCostPct: number;
  focusGain?: number;
}

export interface ClassSpec {
  key: string;
  name: string;
  color: string;
  icon: string;
  iconImg: string;
  formulas: ClassFormulas;
  baseStats: Stats;
  startingLevel: number;
  statGrowth: Partial<Stats>;
  armor: number;
  magicResist: number;
  resource: ResourceConfig;
  comboConfig?: ComboConfig;
  talents: Talent[];
  capstones: Capstone[];
  abilities: Ability[];
  pets: Pet[];
  hooks?: ClassHooks;
}

/** Estado del objetivo (enemigo) visible para las resoluciones. */
export interface TargetState {
  currentHP: number;
  maxHP: number;
  hpPct: number;
  /** true si el enemigo padece un DoT cuya school coincide con la usada. */
  hasChildDot?: boolean;
  /** Efectos activos sobre el objetivo (dots/debuffs/buffs). */
  activeEffects: { name: string; type: string; school?: string }[];
  armor: number;
  magicResist: number;
  isBoss?: boolean;
}

/** Estado del caster visible para las resoluciones. */
export interface CasterState {
  level: number;
  stats: Stats;
  talents: Record<string, number>;
  effects: ActiveEffect[];
  soulShards: number;
  hasActivePet?: boolean;
  activePetId?: string;
  energy?: number;
  focus?: number;
  rage?: number;
  comboPoints?: number;
  stealth?: boolean;
  behind?: boolean;
}

export interface CombatContext {
  caster: CasterState;
  target: TargetState;
}

/** Condición evaluable sobre un CombatContext para un modificador. */
export type Condition =
  | { kind: 'targetHpBelowPct'; pct: number }
  | { kind: 'targetHpAbovePct'; pct: number }
  | { kind: 'targetHasDot' }
  | { kind: 'targetHasEffect'; name: string }
  | { kind: 'targetArmorBelow'; value: number }
  | { kind: 'casterHasEffect'; name: string }
  | { kind: 'casterIsStealthed' }
  | { kind: 'always' };

export interface AbilityResolution {
  directBonusPct?: number;
  dotTurnsAdded?: number;
  spellPowerPct?: number;
  maxHpPct?: number;
  /** Fuerza el cast como instantáneo (backdraft → Immolate). */
  forceInstant?: boolean;
}

export interface CastResult {
  min: number;
  max: number;
  roll: number;
  isCrit: boolean;
}

export interface AfterCastOutcome {
  extraHeal?: number;
  shardsRecovered?: number;
  petHeal?: number;
  comboRecovered?: number;
  energyRecovered?: number;
}

export interface ClassHooks {
  resolveAbility?: (ability: Ability, ctx: CombatContext) => AbilityResolution | null;
  /** Lógica tras resolver el roll: drain-life extra, soul leech, conduit, etc. */
  afterCast?: (ability: Ability, ctx: CombatContext, result: CastResult) => AfterCastOutcome | null;
}
