import { computed, inject, Injectable, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { MAGE, ROGUE, HUNTER, WARLOCK } from '@core/classes';
import { toPlayerDoc, applyFicha } from '@state/mappers';
import type { PlayerFichaPublic } from '@state/contracts';
import type { PlayerEventType } from '@state/contracts';
import { createCombatEngine } from '@core/engine/resolve';
import type { Ability, ActiveEffect, ClassSpec, CombatContext } from '@core/engine/types';

export interface ActivePet {
  petId: string;
  currentHP: number;
  currentMana: number;
}

export interface PlayerState {
  name: string;
  classKey: string;
  level: number;
  currentXP: number;
  currentHP: number;
  currentMana: number;
  soulShards: number;
  talents: Record<string, number>;
  trainedRanks: Record<string, number>;
  activeEffects: ActiveEffect[];
  activePet: ActivePet | null;
  currentCooldowns: Record<string, number>;
  raidSymbol: number | null;
  capstone?: string;
}

const CLASS_REGISTRY: Record<string, ClassSpec> = {
  warlock: WARLOCK,
  mage: MAGE,
  rogue: ROGUE,
  hunter: HUNTER,
};

export const XP_TABLE = [
  400, 900, 1400, 2100, 2800, 3600, 4500, 5400, 6500, 7600,
  8800, 10100, 11500, 13000, 14600, 16300, 18100, 20000, 22000, 24100,
  26300, 28600, 31000, 33500, 36100, 38800, 41600, 44500, 47500, 50600,
  53800, 57100, 60500, 64000, 67600, 71300, 75100, 79000, 83000, 87100,
  91300, 95600, 100000, 104500, 109100, 113800, 118600, 123500, 128500, 133600,
  138800, 144100, 149500, 155000, 160600, 166300, 172100, 178000, 184000,
];

export function xpForLevel(level: number): number {
  if (level >= 60) return 0;
  return XP_TABLE[level - 1] || 0;
}

export interface AbilityViewModel {
  ability: Ability;
  rank: number;
  unlocked: boolean;
  currentMin: number;
  currentMax: number;
  dotTick: number;
  dotDuration: number;
  dotTotal: number;
  scaledCost: number;
  shardCost: number;
  isUtility: boolean;
  isPetAbility: boolean;
  petAbilityType?: string;
  buffValue: number;
  buffDuration: number;
  buffStat: string;
  lifeTapValue: number;
  manaGemValue: number;
  buffRankBased: boolean;
}

function defaultState(): PlayerState {
  return {
    name: 'Aranir',
    classKey: 'warlock',
    level: 1,
    currentXP: 0,
    currentHP: 0,
    currentMana: 0,
    soulShards: 0,
    talents: {},
    trainedRanks: {},
    activeEffects: [],
    activePet: null,
    currentCooldowns: {},
    raidSymbol: null,
  };
}

@Injectable({ providedIn: 'root' })
export class PlayerStateService {
  private engineCache = new Map<string, ReturnType<typeof createCombatEngine>>();

  readonly character = signal<PlayerState>(defaultState());

  /** Clase activa según la ficha; sus lecturas son reactivas vía character().classKey. */
  get cls(): ClassSpec {
    return CLASS_REGISTRY[this.character().classKey] || WARLOCK;
  }

  /** Clases disponibles para el selector (clave + nombre visible). */
  get classEntries(): { key: string; name: string }[] {
    return Object.values(CLASS_REGISTRY).map(c => ({ key: c.key, name: c.name }));
  }

  /** Engine cacheado por clase (se recrea solo si cambia el classKey). */
  get engine() {
    const key = this.cls.key;
    if (!this.engineCache.has(key)) this.engineCache.set(key, createCombatEngine(this.cls));
    return this.engineCache.get(key)!;
  }

  readonly turnNumber = signal(1);
  readonly actionsUsed = signal(0);
  readonly turnDamage = signal(0);
  readonly toastMessage = signal('');
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  /** Bus de comandos del jugador para la cola party/events (→ master). */
  readonly playerEvents = new Subject<{ type: PlayerEventType; payload: Record<string, unknown> }>();

  constructor() {
    this.healToFull();
  }

  showToast(msg: string) {
    this.toastMessage.set(msg);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastMessage.set(''), 4000);
  }

  private engineState() {
    const c = this.character();
    return {
      level: c.level,
      baseStats: this.cls.baseStats,
      gear: {},
      effects: c.activeEffects,
      talents: c.talents,
      soulShards: c.soulShards,
    };
  }

  readonly stats = computed(() => this.engine.stats(this.engineState()));
  readonly maxHP = computed(() => this.engine.maxHp(this.engineState()));
  readonly maxMana = computed(() => this.engine.maxMana(this.engineState()));
  readonly spellPower = computed(() => this.engine.spellPower(this.engineState()));
  readonly manaRegen = computed(() => this.cls.formulas.manaRegen(this.stats()));
  readonly baseMana = computed(() => this.maxMana());

  readonly hpActual = computed(() => Math.min(this.character().currentHP, this.maxHP()));
  readonly hpPercent = computed(() => (this.maxHP() > 0 ? Math.round((this.hpActual() / this.maxHP()) * 100) : 0));
  readonly resourceType = 'mana' as const;
  readonly resourceActual = computed(() => Math.min(this.character().currentMana, this.maxMana()));
  readonly resourceMax = computed(() => this.maxMana());
  readonly resourcePercent = computed(() => (this.maxMana() > 0 ? Math.round((this.resourceActual() / this.maxMana()) * 100) : 0));

  get maxActions(): number {
    return 2;
  }
  canAct(cost: number): boolean {
    return this.actionsUsed() + cost <= this.maxActions;
  }
  useAction(cost: number) {
    this.actionsUsed.update(n => n + cost);
  }

  readonly soulShardMax = computed(() => 5 + (this.character().talents['pocket_shards'] || 0));
  readonly shardArray = computed(() => Array.from({ length: this.soulShardMax() }, (_, i) => i + 1));

  getShards(): number {
    return this.character().soulShards || 0;
  }

  addShard(amount: number) {
    this.character.update(c => ({ ...c, soulShards: Math.min(this.soulShardMax(), (c.soulShards || 0) + amount) }));
  }

  spendShards(amount: number): boolean {
    const cur = this.character().soulShards || 0;
    if (cur < amount) return false;
    this.character.update(c => ({ ...c, soulShards: cur - amount }));
    return true;
  }

  readonly xpForNextLevel = computed(() => xpForLevel(this.character().level));
  readonly xpProgressPercent = computed(() => {
    const need = this.xpForNextLevel();
    if (need === 0) return 100;
    return Math.min(100, Math.floor(((this.character().currentXP || 0) / need) * 100));
  });

  addXP(amount: number) {
    const before = this.character().level;
    this.character.update(c => {
      let xp = c.currentXP + amount;
      let lvl = c.level;
      while (lvl < 60 && xp >= xpForLevel(lvl)) {
        xp -= xpForLevel(lvl);
        lvl++;
      }
      if (lvl >= 60) xp = 0;
      return { ...c, currentXP: xp, level: lvl };
    });
    if (this.character().level > before) {
      this.trainAll();
      this.showToast('🎉 ¡Subes a nivel ' + this.character().level + '! Habilidades aprendidas');
    } else {
      this.showToast('+' + amount + ' XP');
    }
  }

  // ==================== TALENTS ====================

  readonly spentTalentPoints = computed(() => Object.values(this.character().talents).reduce((s, v) => s + v, 0));
  readonly totalTalentPoints = computed(() => Math.max(0, this.character().level - 9));
  readonly availableTalentPoints = computed(() => this.totalTalentPoints() - this.spentTalentPoints());

  talentRank(id: string): number {
    const rank = this.character().talents?.[id] || 0;
    const max = this.cls.talents.find(t => t.id === id)?.maxRank;
    return max && rank > max ? max : rank;
  }

  readonly tiers = computed(() => [...new Set(this.cls.talents.map(t => t.tier))].sort());

  tierPointsSpent(tier: number): number {
    return this.cls.talents.filter(t => t.tier === tier).reduce((s, t) => s + this.talentRank(t.id), 0);
  }

  tierUnlocked(tier: number): boolean {
    if (tier <= 1) return true;
    let total = 0;
    for (let t = 1; t < tier; t++) total += this.tierPointsSpent(t);
    return total >= (tier - 1) * 5;
  }

  talentsByTier(tier: number) {
    return this.cls.talents.filter(t => t.tier === tier);
  }

  talentById(id: string) {
    return this.cls.talents.find(t => t.id === id);
  }

  prereqMet(talent: any): boolean {
    if (!this.tierUnlocked(talent.tier)) return false;
    if (!talent.requires) return true;
    return this.talentRank(talent.requires.id) >= talent.requires.points;
  }

  canAddTalent(talent: any): boolean {
    return this.availableTalentPoints() > 0 && this.talentRank(talent.id) < talent.maxRank && this.prereqMet(talent);
  }

  poolAndPre(talent: any): boolean {
    return this.availableTalentPoints() > 0 && !this.isMaxed(talent.id, talent.maxRank) && this.prereqMet(talent);
  }

  isMaxed(talentId: string, maxRank: number): boolean {
    return this.talentRank(talentId) >= maxRank;
  }

  addTalentPoint(id: string) {
    const talent = this.talentById(id);
    if (!talent || !this.canAddTalent(talent)) return;
    this.character.update(c => ({ ...c, talents: { ...c.talents, [id]: (c.talents[id] || 0) + 1 } }));
  }

  removeTalentPoint(id: string) {
    const rank = this.talentRank(id);
    if (rank <= 0) return;
    this.character.update(c => {
      const talents = { ...c.talents, [id]: rank - 1 };
      if (talents[id] <= 0) delete talents[id];
      return { ...c, talents };
    });
  }

  resetTalents() {
    const capstone = this.character().capstone;
    this.character.update(c => ({ ...c, talents: {} }));
    if (capstone) {
      const t = this.talentById(capstone);
      if (t) this.character.update(c => ({ ...c, capstone: undefined }));
    }
  }

  readonly selectedCapstone = computed(() => this.character().capstone || '');
  readonly capstones = computed(() => this.cls.capstones);

  selectCapstone(id: string) {
    if (this.spentTalentPoints() < 24) {
      this.showToast('Faltan puntos: capstone requiere 24 pts de talento');
      return;
    }
    this.character.update(c => ({ ...c, capstone: this.character().capstone === id ? undefined : id }));
  }

  readonly capstoneUnlocked = computed(() => this.spentTalentPoints() >= 24);

  // ==================== ABILITIES ====================

  trainedRank(abilityId: string): number {
    return this.character().trainedRanks?.[abilityId] || 0;
  }

  maxAvailableRank(ability: Ability): number {
    return this.maxAvailableRankFor(ability, this.character().level);
  }

  maxAvailableRankFor(ability: Ability, level: number): number {
    if (ability.damageRanges) {
      let rank = 0;
      for (const dr of ability.damageRanges) if (level >= dr.level) rank = dr.rank;
      return rank;
    }
    if (ability.buffRanks) {
      return ability.buffRanks.filter(br => level >= br.level).length;
    }
    if (ability.manaGemRanks) {
      return ability.manaGemRanks.filter(br => level >= br.level).length;
    }
    const lvls = [ability.requiredLevel, ability.requiredLevel + 8, ability.requiredLevel + 16, ability.requiredLevel + 24];
    let rank = 0;
    for (let i = 0; i < lvls.length; i++) if (level >= lvls[i]) rank = i + 1;
    return rank;
  }

  private ctx(): CombatContext {
    const c = this.character();
    return {
      caster: {
        level: c.level,
        stats: this.stats(),
        talents: c.talents,
        effects: c.activeEffects,
        soulShards: c.soulShards,
        hasActivePet: !!c.activePet,
        activePetId: c.activePet?.petId,
      },
      target: {
        currentHP: 100,
        maxHP: 100,
        hpPct: 100,
        activeEffects: [],
        armor: 10,
        magicResist: 5,
      },
    };
  }

  abilityViewModel(a: Ability): AbilityViewModel {
    const isUtility = a.type === 'utility';
    const isPetAbility = !!a.petAbility;
    const isRanked = !!a.damageRanges || !!a.dotRanges || !!a.buffRanks || !!a.manaGemRanks;
    const baseRank = a.capstoneGate ? this.maxAvailableRank(a) : this.trainedRank(a.id);
    const rank = isRanked ? Math.max(1, baseRank) : Math.max(1, baseRank || 1);
    const isUnlocked = isUtility && !isPetAbility
      ? this.utilityUnlocked(a)
      : isPetAbility
        ? this.trainedRank(a.id) > 0 && !!this.character().activePet && this.character().activePet!.petId === a.petAbility
        : this.trainedRank(a.id) > 0;

    const dmg = this.engine.damage(this.engineState(), a, rank, rank > 0 ? this.ctx() : undefined);
    const dot = this.engine.dot(this.engineState(), a, rank, rank > 0 ? this.ctx() : undefined);

    let buffValue = 0;
    let buffDuration = a.buff?.duration || 0;
    let buffStat = a.buff?.stat || '';
    if (a.buffRanks?.length) {
      const br = a.buffRanks.find(r => r.rank === rank);
      buffValue = br ? br.value : 0;
      buffDuration = a.buff?.duration || 0;
      buffStat = buffValue > 0 ? (a.buff?.stat || 'spellPower') : '';
    }
    let lifeTapValue = 0;
    if (a.id === 'life_tap') {
      const br = a.buffRanks?.find(r => r.rank === rank);
      lifeTapValue = br ? br.value : 0;
    }
    let manaGemValue = 0;
    if (a.manaGemRanks?.length) {
      const br = a.manaGemRanks.find(r => r.rank === rank);
      manaGemValue = br ? br.value : 0;
    }

    return {
      ability: a,
      rank,
      unlocked: isUnlocked,
      currentMin: dmg?.min ?? 0,
      currentMax: dmg?.max ?? 0,
      dotTick: dot?.dotTick ?? 0,
      dotDuration: dot?.dotDuration ?? 0,
      dotTotal: dot?.dotTotal ?? 0,
      scaledCost: this.engine.resourceCost(this.engineState(), a, rank, rank > 0 ? this.ctx() : undefined),
      shardCost: a.shardCost || 0,
      isUtility,
      isPetAbility,
      petAbilityType: a.petAbility,
      buffValue,
      buffDuration,
      buffStat,
      lifeTapValue,
      manaGemValue,
      buffRankBased: !!a.buffRanks,
    };
  }

  private utilityUnlocked(a: Ability): boolean {
    if (a.capstoneGate) return this.selectedCapstone() === a.capstoneGate;
    return this.trainedRank(a.id) > 0 || (a.id === 'unsummon_pet' && !!this.character().activePet);
  }

  readonly abilityViewModels = computed(() => this.cls.abilities.map(a => this.abilityViewModel(a)));

  readonly unlockedAbilities = computed(() => this.abilityViewModels().filter(v => !v.isUtility && !v.isPetAbility && v.unlocked));
  readonly unlockedUtility = computed(() => this.abilityViewModels().filter(v => v.isUtility && !v.isPetAbility && v.unlocked));
  readonly unlockedPetAbilities = computed(() => this.abilityViewModels().filter(v => v.isPetAbility && v.unlocked));

  readonly trainableAbilities = computed(() =>
    this.abilityViewModels().filter(v => {
      const a = v.ability;
      if (a.capstoneGate) return false;
      if (v.isPetAbility) return false;
      if (v.isUtility) {
        if (a.buffRanks || a.manaGemRanks) {
          const maxBR = this.maxAvailableRank(a);
          return maxBR > this.trainedRank(a.id);
        }
        if (a.damageRanges) {
          const maxRank = this.maxAvailableRank(a);
          return maxRank > 0 && this.trainedRank(a.id) < maxRank;
        }
        return this.character().level >= a.requiredLevel && this.trainedRank(a.id) === 0;
      }
      const maxRank = this.maxAvailableRank(a);
      return maxRank > 0 && this.trainedRank(a.id) < maxRank;
    }).map(v => v),
  );

  readonly canTrain = computed(() => this.trainableAbilities().length > 0);

  /** Autoaprendizaje: fija cada habilidad al rango máximo disponible en el nivel actual. */
  trainAll() {
    this.character.update(c => {
      const trained: Record<string, number> = { ...c.trainedRanks };
      for (const a of this.cls.abilities) {
        if (!a || a.capstoneGate || a.petAbility) continue;
        const max = this.maxAvailableRankFor(a, c.level);
        if (max > (trained[a.id] || 0)) trained[a.id] = max;
      }
      return { ...c, trainedRanks: trained };
    });
  }

  getCooldown(abilityId: string): number {
    return this.character().currentCooldowns?.[abilityId] || 0;
  }

  // ==================== EFFECTS ====================

  readonly visibleEffects = computed(() => (this.character().activeEffects || []).filter(e => e.target !== 'flying'));

  addEffect(eff: Omit<ActiveEffect, 'id'>) {
    this.character.update(c => ({
      ...c,
      activeEffects: [...(c.activeEffects || []), { ...eff, id: Date.now() + Math.random() }],
    }));
  }

  removeEffect(effectId: number) {
    this.character.update(c => ({ ...c, activeEffects: (c.activeEffects || []).filter(e => e.id !== effectId) }));
  }

  hasEffect(name: string): boolean {
    return (this.character().activeEffects || []).some(e => e.name === name);
  }

  // ==================== PET ====================

  readonly activePetData = computed(() => {
    const pet = this.character().activePet;
    return this.cls.pets?.find(p => p.id === pet?.petId) || null;
  });

  readonly petMaxHP = computed(() => {
    const pet = this.activePetData();
    if (!pet) return 0;
    let hp = Math.round(this.maxHP() * pet.hpPct);
    if (pet.id === 'voidwalker') hp = Math.round(hp * this.petTalentBoost());
    return hp;
  });

  readonly petMaxMana = computed(() => {
    const pet = this.activePetData();
    return pet ? Math.round(this.maxMana() * pet.manaPct) : 0;
  });

  readPetHP = computed(() => this.character().activePet?.currentHP || 0);
  readPetMana = computed(() => this.character().activePet?.currentMana || 0);
  petHPPercent = computed(() => {
    const max = this.petMaxHP();
    return max > 0 ? Math.round((this.readPetHP() / max) * 100) : 0;
  });
  petManaPercent = computed(() => {
    const max = this.petMaxMana();
    return max > 0 ? Math.round((this.readPetMana() / max) * 100) : 0;
  });

  petTalentBoost(): number {
    return 1 + this.talentRank('grimoire_of_command') * 0.25;
  }

  // ==================== COMBAT METHODS ====================

  castSpell(a: Ability) {
    if (!this.canAct(1)) {
      this.showToast('Sin acciones disponibles');
      return;
    }
    const v = this.abilityViewModel(a);
    const isDot = !v.isUtility && v.ability.isDot;
    if (!isDot && !v.isUtility && (v.ability.type === 'damage')) {
      if (v.currentMin <= 0 && v.currentMax <= 0) {
        this.showToast(a.name + ': sin daño calculable');
      }
    }

    if (v.isUtility && v.isPetAbility) {
      this.useAction(1);
      this.castPetAbility(v);
      return;
    }

    if (v.shardCost > 0) {
      if (!this.spendShards(v.shardCost)) {
        this.showToast('Necesitas ' + v.shardCost + ' Soul Shards');
        return;
      }
    }

    const isMage = this.cls.key === 'mage';
    const freeCast = isMage && a.castType === 'cast' && this.checkClearcasting();

    if (!freeCast && v.scaledCost > 0) {
      if (this.resourceActual() < v.scaledCost) {
        if (v.shardCost > 0) this.addShard(v.shardCost);
        this.showToast('Mana insuficiente');
        return;
      }
      this.character.update(c => ({ ...c, currentMana: c.currentMana - v.scaledCost }));
    }

    this.useAction(1);
    const effCd = this.effectiveCooldown(v.ability);
    if (effCd > 0) {
      this.character.update(c => ({
        ...c,
        currentCooldowns: { ...c.currentCooldowns, [a.id]: effCd },
      }));
    }

    if (freeCast) this.showToast('🔮 Clearcasting: ' + a.name + ' gratuito');

    this.emitAbilityEvent(a, v);
    if (a.isPetSummon) {
      this.doSummonPet(a.isPetSummon);
      this.showToast('👹 ' + (this.cls.pets?.find(p => p.id === a.isPetSummon)?.name || 'Pet') + ' invocado!');
      return;
    }
    if (a.id === 'unsummon_pet') {
      this.dismissPet();
      return;
    }
    if (a.id === 'life_tap') {
      const cost = Math.round(this.maxHP() * 0.1);
      this.character.update(c => ({ ...c, currentHP: Math.max(0, c.currentHP - cost), currentMana: Math.min(this.maxMana(), c.currentMana + v.lifeTapValue) }));
      this.showToast('💧 Life Tap: −' + cost + ' HP · +' + v.lifeTapValue + ' maná');
      return;
    }
    if (a.id === 'fel_armor') {
      this.replaceBuff({ type: 'buff', name: 'Fel Armor', target: 'spellPower', value: v.buffValue, duration: 999, isPercent: false });
      this.showToast('🛡️ Fel Armor: +' + v.buffValue + ' Spell Power');
      return;
    }
    if (a.id === 'healthstone') {
      const heal = v.currentMin + Math.floor(Math.random() * (v.currentMax - v.currentMin + 1));
      this.character.update(c => ({ ...c, currentHP: Math.min(this.maxHP(), c.currentHP + heal) }));
      this.showToast('💎 Healthstone: +' + heal + ' HP');
      return;
    }
    if (a.id === 'summon_infernal') {
      this.doSummonInfernal(v);
      return;
    }
    if (a.id === 'manam_gem_restore') {
      this.applyManaGem(v);
      return;
    }
    if (isMage && a.manaGemRanks) {
      this.applyManaGem(v);
      return;
    }
    if (a.id === 'arcane_intellect') {
      this.replaceBuff({ type: 'buff', name: 'Arcane Intellect', target: 'intelecto', value: v.buffValue, duration: v.buffDuration, isPercent: false });
      this.showToast('🧠 Arcane Intellect: +' + v.buffValue + ' Intelecto · ' + v.buffDuration + 't');
      return;
    }
    if (a.id === 'frost_armor') {
      this.replaceBuff({ type: 'buff', name: 'Frost Armor', target: 'armor', value: v.buffValue, duration: v.buffDuration, isPercent: false });
      this.showToast('🧊 Frost Armor: +' + v.buffValue + ' Armadura · ' + v.buffDuration + 't');
      return;
    }
    if (a.id === 'combustion' && isMage) {
      this.mageCapstoneBuff('Combustion', [{ target: 'combustion', value: 50 }], 3);
      return;
    }
    if (a.id === 'icy_veins' && isMage) {
      this.mageCapstoneBuff('Icy Veins', [{ target: 'icy_veins', value: 1 }], 2);
      return;
    }
    if (a.id === 'arcane_power' && isMage) {
      this.mageCapstoneBuff('Arcane Power', [{ target: 'manaCost', value: -50, isPercent: true }, { target: 'spellPower', value: 20, isPercent: true }], 2);
      return;
    }
    if (a.id === 'blink') {
      this.showToast('💨 Blink: te teletransportas (CD ' + this.effectiveCooldown(a) + ')');
      return;
    }

    if (v.isUtility) {
      this.showToast(a.name + ': ' + a.description);
      return;
    }

    this.rollAndApply(a, v);
  }

  private emitAbilityEvent(a: Ability, v: AbilityViewModel) {
    this.playerEvents.next({
      type: 'lanzarHabilidad',
      payload: {
        abilityId: a.id,
        rank: v.rank,
      },
    });
  }

  castPetAbility(v: AbilityViewModel) {
    const a = v.ability;
    const pet = this.character().activePet;
    if (!pet) return;
    const manaCost = Math.round(this.petMaxMana() * 0.15);
    if (pet.currentMana < manaCost) {
      this.showToast('La pet no tiene mana');
      return;
    }
    this.character.update(c => ({
      ...c,
      activePet: c.activePet ? { ...c.activePet, currentMana: c.activePet.currentMana - manaCost } : null,
    }));
    this.showToast(a.name + (a.id === 'voidwalker_taunt' ? ' — taunt hacia el Voidwalker (2 turnos)' : ' · CD ' + a.cooldown));
  }

  checkClearcasting(): boolean {
    const cc = this.talentRank('clearcasting');
    if (cc <= 0) return false;
    return Math.random() * 100 < cc * 2.5;
  }

  /** Cooldown efectivo tras talentos de reducción (mage: fire_blast/cone_of_cold/blink). */
  effectiveCooldown(a: Ability): number {
    let cd = a.cooldown;
    if (a.id === 'fire_blast') cd -= this.talentRank('improved_fire_blast');
    if (a.id === 'cone_of_cold') cd -= this.talentRank('improved_cone_of_cold');
    if (a.id === 'blink') cd -= this.talentRank('improved_blink');
    return Math.max(0, cd);
  }

  private applyManaGem(v: AbilityViewModel) {
    const rank = v.rank;
    const gained = Math.round((v.manaGemValue || 0) * (1 + this.talentRank('improved_mana_gem') * 0.25));
    this.character.update(c => ({ ...c, currentMana: Math.min(this.maxMana(), (c.currentMana ?? this.maxMana()) + gained) }));
    const effCd = this.effectiveCooldown(v.ability);
    if (effCd > 0) {
      this.character.update(c => ({
        ...c,
        currentCooldowns: { ...c.currentCooldowns, [v.ability.id]: effCd },
      }));
    }
    this.showToast('💎 ' + v.ability.name + ' R' + rank + ': +' + gained + ' maná' + (effCd > 0 ? ' · CD ' + effCd : ''));
  }

  private mageCapstoneBuff(name: string, effects: { target: string; value: number; isPercent?: boolean }[], duration: number) {
    this.character.update(c => ({
      ...c,
      activeEffects: [
        ...(c.activeEffects || []).filter(e => e.name !== name),
        ...effects.map(e => ({ id: Date.now() + Math.random(), type: 'buff', name, target: e.target, value: e.value, isPercent: e.isPercent ?? false, duration }) as ActiveEffect),
      ],
    }));
    this.showToast(`✨ ${name} activa (${duration} turno(s))`);
  }

  /** Ignite: un crítico con Fuego prende un DoT de 8% del daño por punto durante 3 turnos. */
  private igniteOnCrit(a: Ability, roll: number, isCrit: boolean) {
    if (a.school !== 'Fuego') return;
    const ignite = this.talentRank('ignite');
    if (!isCrit || ignite <= 0) return;
    const tick = Math.round(roll * 0.08 * ignite);
    if (tick <= 0) return;
    this.character.update(c => ({
      ...c,
      activeEffects: [
        ...(c.activeEffects || []),
        { id: Date.now() + Math.random(), type: 'dot', name: 'Ignite', target: 'ignite', value: tick, duration: 3, school: 'Fuego' },
      ],
    }));
    this.showToast(`🔥 Ignite: ${tick}/t durante 3 turnos`);
  }

  rollAndApply(a: Ability, v: AbilityViewModel) {
    const ctx = this.ctx();
    let critChance = this.engine.crit(this.engineState(), a, ctx);
    if (a.school === 'Fuego' && this.hasEffect('Combustion')) critChance += 50;
    const isCrit = Math.random() * 100 < critChance;
    const min = v.currentMin;
    const max = v.currentMax;
    let roll = min + Math.floor(Math.random() * (max - min + 1));
    if (isCrit) roll = Math.round(roll * 1.5);

    const dot = this.engine.dot(this.engineState(), a, v.rank, ctx);
    const isDot = !!a.isDot;

    let shardRecovered = false;
    const gen = a.generatesShard || 0;
    if (gen > 0) this.addShard(gen);

    if (isDot && dot) {
      this.turnDamage.update(d => d + dot.dotTotal);
      this.showToast(`${a.name}: DoT ${dot.dotTick}/t · ${dot.dotDuration}t` + (isCrit ? ' ¡CRITICO!' : ''));
    } else {
      this.character.update(c => ({ ...c, currentHP: Math.min(this.maxHP(), c.currentHP > 0 ? c.currentHP : c.currentHP) }));
      const lifesteal = a.lifestealPct || 0;
      if (lifesteal > 0) {
        const heal = Math.round(roll * lifesteal * (1 + this.talentRank('improved_drain_life') * 0.1));
        this.character.update(c => ({ ...c, currentHP: Math.min(this.maxHP(), c.currentHP + heal) }));
        this.showToast(`${a.name}: ${roll} danyo${isCrit ? ' ¡CRITICO!' : ''} · te curas ${heal}`);
      } else {
        const leech = this.talentRank('soul_leech');
        if (leech > 0 && (a.id === 'shadow_bolt' || a.id === 'chaos_bolt')) {
          const leechHeal = Math.round(roll * leech * 0.1);
          this.character.update(c => ({ ...c, currentHP: Math.min(this.maxHP(), c.currentHP + leechHeal) }));
          this.showToast(`${a.name}: ${roll} danyo${isCrit ? ' ¡CRITICO!' : ''} · Soul Leech +${leechHeal} HP`);
        } else {
          this.showToast(`${a.name}: ${roll} danyo${isCrit ? ' ¡CRITICO!' : ''}`);
        }
      }
      this.igniteOnCrit(a, roll, isCrit);
      this.turnDamage.update(d => d + roll);
    }

    const sc = this.talentRank('soul_conduit');
    if (sc > 0 && a.spendsShards) {
      for (let i = 0; i < (a.shardCost || 0); i++) {
        if (Math.random() * 100 < sc * 20) {
          this.addShard(1);
          shardRecovered = true;
        }
      }
    }
    if (shardRecovered) this.showToast('🌀 Soul Conduit: recuperas 1 Soul Shard');
  }

  private doSummonPet(petId: string) {
    const pet = this.cls.pets?.find(p => p.id === petId);
    if (!pet) return;
    let hp = Math.round(this.maxHP() * pet.hpPct);
    if (pet.id === 'voidwalker') hp = Math.round(hp * this.petTalentBoost());
    const mana = Math.round(this.maxMana() * pet.manaPct);
    this.character.update(c => ({
      ...c,
      activePet: { petId, currentHP: hp, currentMana: mana },
      activeEffects: (c.activeEffects || []).filter(e => e.name !== 'Burning Soul' && e.name !== 'Void Fortitude'),
    }));
  }

  dismissPet() {
    this.character.update(c => ({ ...c, activePet: null }));
    this.showToast('' + (this.cls.pets?.find(p => p.id === this.character().activePet?.petId)?.name || '') + ' desinvocado');
    this.showToast('Pets desinvocadas');
  }

  petAttack() {
    const c = this.character();
    const pet = this.activePetData();
    if (!pet || !c.activePet) return null;
    if (c.activePet.currentMana < Math.round(this.petMaxMana() * pet.manaCostPct)) return null;
    let damage = Math.round(pet.attackMin + Math.random() * (pet.attackMax - pet.attackMin));
    if (pet.id === 'imp') damage = Math.round(damage * this.petTalentBoost());
    this.character.update(x => ({
      ...x,
      activePet: x.activePet ? { ...x.activePet, currentMana: Math.max(0, x.activePet.currentMana - Math.round(this.petMaxMana() * pet.manaCostPct)) } : null,
    }));
    this.turnDamage.update(d => d + damage);
    this.showToast(`👹 ${pet.attackName}: ${damage} danyo de ${pet.attackSchool}`);
    return damage;
  }

  private replaceBuff(eff: Omit<ActiveEffect, 'id'>) {
    const name = eff.name;
    this.character.update(c => ({
      ...c,
      activeEffects: [...(c.activeEffects || []).filter(e => e.name !== name), { ...eff, id: Date.now() + Math.random() }],
    }));
  }

  private doSummonInfernal(v: AbilityViewModel) {
    const dmgMin = v.currentMin;
    const dmgMax = v.currentMax;
    const roll = dmgMin + Math.floor(Math.random() * ((dmgMax - dmgMin) + 1));
    this.turnDamage.update(d => d + roll);
    this.character.update(c => ({ ...c, infernalTurnsLeft: (c as any).infernalTurnsLeft || 4 }));
    this.showToast(`🔥 Infernal aterriza: ${roll} danyo de Fuego AOE · stun 1 turno · lucha 4 turnos`);
  }

  // ==================== TURN ====================

  emitMove() {
    this.playerEvents.next({ type: 'mover', payload: {} });
  }

  endTurn() {
    const oldTurn = this.turnNumber();
    const snackMsgs: string[] = [];

    if (this.cls.key === 'mage') {
      const snacks = this.talentRank('combat_snacks');
      if (snacks > 0) {
        const hpSnack = Math.round(this.maxHP() * 0.005 * snacks);
        const manaSnack = Math.round(this.maxMana() * 0.015 * snacks);
        this.character.update(c => ({
          ...c,
          currentHP: Math.min(this.maxHP(), (c.currentHP ?? this.maxHP()) + hpSnack),
          currentMana: Math.min(this.maxMana(), (c.currentMana ?? this.maxMana()) + manaSnack),
        }));
        snackMsgs.push(`+${hpSnack} vida · +${manaSnack} maná`);
      }
      if (this.hasEffect('Arcane Power')) {
        const restored = Math.round(this.maxMana() * 0.2);
        this.character.update(c => ({ ...c, currentMana: Math.min(this.maxMana(), (c.currentMana ?? this.maxMana()) + restored) }));
        snackMsgs.push('Arcane Power +' + restored + ' maná');
      }
    }

    const effectsTick = this.character().activeEffects || [];
    const hotMsgs: string[] = [];
    for (const eff of effectsTick) {
      if (eff.type === 'hot') {
        this.character.update(c => ({ ...c, currentHP: Math.min(this.maxHP(), c.currentHP + eff.value) }));
        hotMsgs.push('+' + eff.value + ' ' + eff.name);
      } else if (eff.type === 'dot') {
        this.character.update(c => ({ ...c, currentHP: Math.max(0, c.currentHP - eff.value) }));
        hotMsgs.push('-' + eff.value + ' ' + eff.name);
      }
    }

    const petAttack = this.petAttack();

    this.character.update(c => {
      const cooldowns: Record<string, number> = {};
      for (const [k, vv] of Object.entries(c.currentCooldowns || {})) {
        if (vv > 1) cooldowns[k] = vv - 1;
      }
      const effects = (c.activeEffects || []).map(e => ({ ...e, duration: e.duration - 1 })).filter(e => e.duration > 0);
      const mana = Math.min(this.maxMana(), c.currentMana + this.manaRegen());
      const pet = c.activePet
        ? { ...c.activePet, currentMana: Math.min(this.petMaxMana(), c.activePet.currentMana + Math.round(this.petMaxMana() * 0.05)) }
        : null;
      const infernalTurnsLeft = (c as any).infernalTurnsLeft ?? 0;
      return { ...c, currentCooldowns: cooldowns, activeEffects: effects, currentMana: mana, activePet: pet, infernalTurnsLeft: Math.max(0, infernalTurnsLeft - (infernalTurnsLeft > 0 ? 1 : 0)) };
    });

    this.turnNumber.update(n => n + 1);
    this.turnDamage.set(0);
    this.actionsUsed.set(0);
    this.showToast('Fin de turno ' + oldTurn + ' · +' + this.manaRegen() + ' maná' + (petAttack ? ' · pet atacó' : '') + (snackMsgs.length ? ' · 🍖 ' + snackMsgs.join(' · 🍖 ') : '') + (hotMsgs.length ? ' · ' + hotMsgs.join(' · ') : ''));
  }

  fullRest() {
    this.character.update(c => ({
      ...c,
      currentHP: this.maxHP(),
      currentMana: this.maxMana(),
      activePet: c.activePet ? { ...c.activePet, currentHP: this.petMaxHP(), currentMana: this.petMaxMana() } : null,
    }));
    this.showToast('🥐 Full Rest: vida y maná al máximo');
  }

  healToFull() {
    const c = this.character();
    this.character.update(x => ({ ...x, currentHP: this.engine.maxHp(this.engineState()), currentMana: this.engine.maxMana(this.engineState()) }));
  }

  // ==================== STATS MODAL ====================

  readonly experience = signal(0);
  readonly attackPower = computed(() => this.cls.formulas.attackPower(this.stats()));
  readonly meleeCrit = computed(() => {
    const fromAgi = this.stats().agilidad / 20;
    return (5 + fromAgi + this.character().level * 0.02).toFixed(2);
  });
  readonly spellCritDisplay = computed(() => this.spellCrit().toFixed(2));
  spellCrit(): number {
    return 5 + this.stats().intelecto / 60 + this.character().level * 0.02;
  }
  readonly armorTotal = computed(() => {
    let total = this.cls.armor || 0;
    const effects = this.character().activeEffects || [];
    for (const eff of effects) if (eff.type === 'buff' && eff.target === 'armor') total += eff.value;
    return total;
  });
  readonly magicResistTotal = computed(() => this.cls.magicResist || 0);
  readonly physReduction = computed(() => {
    const armor = this.armorTotal();
    const lvl = this.character().level;
    return Math.round((armor / (armor + 50 + 5 * lvl)) * 100);
  });
  readonly magicReduction = computed(() => {
    const resist = this.magicResistTotal();
    const lvl = this.character().level;
    return Math.round((resist / (resist + 50 + 5 * lvl)) * 100);
  });
  readonly evasion = computed(() => 0);

  levelStatBonus(key: string): number {
    const growth = this.cls.statGrowth || {};
    return Math.floor((this.character().level - 1) * (growth[key as keyof typeof growth] || 0));
  }

  statBonus(_key: string): number {
    return 0;
  }

  // ==================== IMPORT/EXPORT ====================

  exportCharacter(): string {
    return JSON.stringify({ ...this.character(), classKey: this.character().classKey || 'warlock' }, null, 2);
  }

  /** Ficha solo persistible (lo que viaja a Firestore; el derivado queda fuera). */
  persistibleFicha(): PlayerFichaPublic {
    return toPlayerDoc({ ...this.character(), classKey: this.character().classKey || 'warlock' });
  }

  /** Aplica una ficha venida de Firestore (solo campos persistibles, mantiene estado volátil). */
  applyRemoteFicha(ficha: PlayerFichaPublic | null) {
    if (!ficha) return;
    this.character.update(c => applyFicha({ ...c, classKey: ficha.classKey || c.classKey || 'warlock' }, ficha) as any);
  }

  /** Cambia de clase: reinicia talentos/habilidades entrenadas/capstone y guarda al instante. */
  setClass(key: string) {
    const spec = CLASS_REGISTRY[key];
    if (!spec || spec.key === this.character().classKey) return;
    this.character.update(c => ({
      ...c,
      classKey: spec.key,
      talents: {},
      trainedRanks: {},
      activeEffects: [],
      activePet: null,
      currentCooldowns: {},
      capstone: undefined,
      currentMana: this.engine.maxMana(this.engineState()),
    }));
    this.healToFull();
    this.trainAll();
    this.showToast('Clase cambiada: ' + spec.name);
  }

  resetCharacter() {
    this.character.set(defaultState());
    this.turnNumber.set(1);
    this.actionsUsed.set(0);
    this.turnDamage.set(0);
    this.healToFull();
    this.trainAll();
    this.showToast('Personaje reiniciado');
  }

  setRaidSymbol(index: number) {
    this.character.update(c => ({ ...c, raidSymbol: c.raidSymbol === index ? null : index }));
  }

  onNameInput(name: string) {
    this.character.update(c => ({ ...c, name }));
  }
}
