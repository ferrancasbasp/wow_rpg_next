import { Component, computed, inject, signal } from '@angular/core';
import { PlayerStateService, type AbilityViewModel } from '../services/player-state.service';
import { SyncService } from '../services/sync.service';
import { MOB_SYMBOLS } from '../data/mob-symbols';
import { WARLOCK } from '@core/classes';
import type { ActiveEffect, Ability } from '@core/engine/types';

const STAT_KEYS: Record<string, string> = {
  fuerza: 'Fuerza',
  agilidad: 'Agilidad',
  intelecto: 'Intelecto',
  aguante: 'Aguante',
  espiritu: 'Espiritu',
};

const STAT_ICONS: Record<string, string> = {
  fuerza: '💪',
  agilidad: '🦵',
  intelecto: '🧠',
  aguante: '❤️',
  espiritu: '✨',
};

const STAT_ABBR: Record<string, string> = {
  fuerza: 'Fuer',
  agilidad: 'Agi',
  intelecto: 'Int',
  aguante: 'Agu',
  espiritu: 'Esp',
};

@Component({
  selector: 'app-player',
  standalone: true,
  imports: [],
  host: {
    '[style.--class-color]': "'#8B2DF0'",
    '[style.--class-glow]': "'#8B2DF04D'",
  },
  templateUrl: './player.component.html',
  styleUrls: ['./player.component.css'],
})
export class PlayerComponent {
  st = inject(PlayerStateService);
  private sync = inject(SyncService);

  STAT_KEYS = STAT_KEYS;
  STAT_ICONS = STAT_ICONS;
  STAT_ABBR = STAT_ABBR;
  statEntries = ([
    ['Fuerza', 'fuerza'],
    ['Agilidad', 'agilidad'],
    ['Intelecto', 'intelecto'],
    ['Aguante', 'aguante'],
    ['Espiritu', 'espiritu'],
  ] as [string, string][]);

  armorSlots = () =>
    [
      { key: 'head', label: 'Cabeza' },
      { key: 'chest', label: 'Pecho' },
      { key: 'hands', label: 'Manos' },
      { key: 'legs', label: 'Piernas' },
      { key: 'feet', label: 'Pies' },
    ];

  weaponSlots = () =>
    [
      { key: 'mainHand', label: 'Mano Fuerte' },
      { key: 'offHand', label: 'Mano Débil' },
    ];

  quantityType(v: AbilityViewModel): string {
    if (v.ability.type === 'heal') return 'heal';
    if (v.ability.isDot) return 'dot';
    return v.ability.type === 'damage' ? 'damage' : '';
  }

  lockedAbilities() {
    return this.st.abilityViewModels().filter(v => !v.isUtility && !v.isPetAbility && !v.unlocked);
  }

  tierLabel(tier: number): string {
    return 'Tier ' + tier;
  }

  talentNodeClass(talent: any): Record<string, boolean> {
    const rank = this.st.talentRank(talent.id);
    return {
      learned: rank > 0,
      maxed: rank >= talent.maxRank,
      available: this.st.poolAndPre(talent),
      clickable: this.st.canAddTalent(talent),
    };
  }

  capstoneNodeClass(capstone: any): Record<string, boolean> {
    const selected = this.st.selectedCapstone() === capstone.id;
    return {
      'capstone-selected': selected,
      available: this.st.capstoneUnlocked(),
      clickable: this.st.capstoneUnlocked(),
    };
  }

  copyJson() {
    navigator.clipboard?.writeText(this.st.exportCharacter()).then(() => this.st.showToast('Copiado al portapapeles'));
  }

  downloadJson() {
    const blob = new Blob([this.st.exportCharacter()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'warlock.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  raidSymbols = () => MOB_SYMBOLS;
  symIndex = (sym: { id: string }) => MOB_SYMBOLS.findIndex(s => s.id === sym.id);

  showStatsModal = signal(false);
  showEquipment = signal(false);
  showTalentModal = signal(false);
  showExportModal = signal(false);
  showLoadModal = signal(false);
  hoveredTalent = signal<any>(null);
  hoveredAbility = signal<AbilityViewModel | null>(null);
  abilityRolls = signal<Record<string, { roll: number; crit: boolean }>>({});
  collectedShards = signal(0);

  levelUpFlash = signal(false);
  levelBonusFlash = signal(false);
  turnFlash = signal(false);

  pendingEndTurn = signal(false);

  classConfig = WARLOCK;

  actionSlotArray = computed(() => Array.from({ length: this.st.maxActions }, (_, i) => i + 1));

  getResourceBarBackground(): string {
    return this.st.resourceType === 'mana' ? 'linear-gradient(90deg, #2e5f8a, #4a90c2)' : '#c79c6e';
  }

  onImgError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const next = img.nextElementSibling as HTMLElement;
    if (next) next.style.display = 'inline';
  }

  onImgErrorSimple(event: Event) {
    (event.target as HTMLImageElement).style.display = 'none';
  }

  onTalentImgError(event: Event) {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
    const next = img.nextElementSibling as HTMLElement;
    if (next) next.style.display = 'flex';
  }

  onNameInput(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.st.onNameInput(value);
  }

  setRaidSymbol(index: number) {
    this.st.setRaidSymbol(index);
  }

  trainAll() {
    this.st.trainAll();
  }

  castSpell(v: AbilityViewModel) {
    this.st.castSpell(v.ability);
  }

  castUtility(v: AbilityViewModel) {
    this.st.castSpell(v.ability);
  }

  castPetAbility(v: AbilityViewModel) {
    this.st.castPetAbility(v);
  }

  moveAction() {
    this.st.useAction(1);
    this.st.emitMove();
    this.st.showToast('🥾 Movimiento usado');
  }

  onEndTurnClick() {
    this.st.endTurn();
  }

  fullRest() {
    this.st.fullRest();
  }

  saveChar() {
    const name = this.st.character().name?.trim();
    if (!name) {
      this.st.showToast('Ponle nombre a tu personaje ante de guardar.');
      return;
    }
    try {
      localStorage.setItem('wow_next_player', this.st.exportCharacter());
      this.sync.flushNow();
      this.st.showToast('💾 Guardado');
    } catch (e) {
      this.st.showToast('Error al guardar');
    }
  }

  loadChar() {
    try {
      const raw = localStorage.getItem('wow_next_player');
      if (!raw) {
        this.st.showToast('No hay personaje guardado');
        return;
      }
      const data = JSON.parse(raw);
      const c: any = this.st.character();
      c.name = data.name || c.name;
      c.level = data.level || 1;
      c.currentXP = data.currentXP || 0;
      c.currentHP = data.currentHP ?? 0;
      c.currentMana = data.currentMana ?? 0;
      c.soulShards = data.soulShards || 0;
      c.talents = data.talents || {};
      c.trainedRanks = data.trainedRanks || {};
      c.activeEffects = data.activeEffects || [];
      c.capstone = data.capstone;
      this.st.character.set(c);
      this.st.healToFull();
      this.sync.flushNow();
      this.st.showToast('📂 Personaje cargado');
    } catch (e) {
      this.st.showToast('Error al cargar');
    }
  }

  resetCharacter() {
    this.st.resetCharacter();
  }

  resetTalents() {
    this.st.resetTalents();
  }

  statBonus(): number {
    return 0;
  }

  addTalentPoint(id: string) {
    this.st.addTalentPoint(id);
  }

  onTalentRightClick(event: Event, id: string) {
    event.preventDefault();
    this.st.removeTalentPoint(id);
  }

  onCapstoneRightClick(event: Event, capstone: { id: string }) {
    event.preventDefault();
    if (this.st.selectedCapstone() === capstone.id) {
      this.st.character.update(c => ({ ...c, capstone: undefined }));
      this.st.showToast('Capstone deseleccionada');
    }
  }

  onCapstoneEnter(capstone: any) {
    this.hoveredTalent.set({ ...capstone, maxRank: 1, tier: 99, requires: null, isCapstone: true });
  }

  onTalentRemove(id: string) {
    this.st.removeTalentPoint(id);
  }

  getTalentName(id: string): string {
    return this.st.talentById(id)?.name || id;
  }

  onTalentHover(talent: any) {
    this.hoveredTalent.set(talent);
  }

  onTalentLeave() {
    this.hoveredTalent.set(null);
  }

  removeEffect(effId: number) {
    this.st.removeEffect(effId);
  }

  recordHumanDamage(amount: number) {
    this.st.showToast('-' + amount + ' HP de daño directo');
    this.st.character.update(c => ({ ...c, currentHP: Math.max(0, c.currentHP - amount) }));
  }

  grantLevel(levels = 1) {
    this.st.character.update(c => ({ ...c, level: Math.min(60, c.level + levels), currentXP: 0 }));
    this.levelUpFlash.set(true);
    setTimeout(() => this.levelUpFlash.set(false), 800);
    this.st.showToast('✨ +' + levels + ' nivel');
  }

  addExperience(amount: number) {
    this.st.addXP(amount);
  }

  levelStatBonus(key: string): number {
    return this.st.levelStatBonus(key);
  }

  baseStatFor(key: string): number {
    return this.st.cls.baseStats[key as keyof typeof this.st.cls.baseStats] || 0;
  }

  finalStatFor(key: string): number {
    return this.st.stats()[key as keyof typeof this.st.cls.baseStats] || 0;
  }
}
