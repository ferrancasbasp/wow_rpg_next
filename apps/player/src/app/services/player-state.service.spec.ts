import { TestBed } from '@angular/core/testing';
import { PlayerStateService, xpForLevel } from '../services/player-state.service';

describe('PlayerStateService (adapter sobre core warlock)', () => {
  let st: PlayerStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    st = TestBed.inject(PlayerStateService);
  });

  it('stats de paridad: HP/mana/SP al nivel 25 sin equipo', () => {
    st.character.update(c => ({ ...c, level: 25 }));
    const lvl = 25;
    const int = 16 + Math.floor((lvl - 1) * 2.0);
    const agu = 14 + Math.floor((lvl - 1) * 1.8);
    expect(st.stats().intelecto).toBe(int);
    expect(st.maxHP()).toBe(Math.round(30 + agu * 9 + lvl * 5));
    expect(st.maxMana()).toBe(Math.round(40 + int * 15 + lvl * 5));
    expect(st.spellPower()).toBe(Math.round(int * 0.65));
  });

  it('entrenar sube un rango por clic (paridad prod) hasta el max del nivel', () => {
    st.character.update(c => ({ ...c, level: 8 }));
    const vm = () => st.abilityViewModels().find(v => v.ability.id === 'shadow_bolt')!;
    st.trainAll();
    expect(vm().rank).toBe(1);
    expect(vm().unlocked).toBe(true);
    st.trainAll();
    expect(vm().rank).toBe(2);
    st.trainAll();
    expect(vm().rank).toBe(2);
  });

  it('puntos de talento: nivel 25 → 16 pts · gastar y resetear', () => {
    st.character.update(c => ({ ...c, level: 25 }));
    expect(st.totalTalentPoints()).toBe(16);
    expect(st.availableTalentPoints()).toBe(16);
    st.addTalentPoint('improved_drain_life');
    expect(st.talentRank('improved_drain_life')).toBe(1);
    expect(st.availableTalentPoints()).toBe(15);
    st.removeTalentPoint('improved_drain_life');
    expect(st.talentRank('improved_drain_life')).toBe(0);
    st.addTalentPoint('improved_drain_life');
    st.addTalentPoint('improved_drain_life');
    st.addTalentPoint('improved_drain_life');
    expect(st.availableTalentPoints()).toBe(13);
    st.resetTalents();
    expect(st.availableTalentPoints()).toBe(16);
  });

  it('tier 3 bloqueada: contagion requiere 10 pts en tiers 1-2', () => {
    st.character.update(c => ({ ...c, level: 40 }));
    st.addTalentPoint('contagion');
    expect(st.talentRank('contagion')).toBe(0);
    st.character.update(c => ({ ...c, talents: { improved_drain_life: 3, destruction_specialization: 3, pocket_shards: 2, demonic_embrace: 2 } }));
    expect(st.tierUnlocked(3)).toBe(true);
    st.addTalentPoint('contagion');
    expect(st.talentRank('contagion')).toBe(1);
  });

  it('soul shards: maximo base 5, pocket_shards lo sube, no se pasa del max', () => {
    expect(st.soulShardMax()).toBe(5);
    st.addShard(7);
    expect(st.getShards()).toBe(5);
    st.character.update(c => ({ ...c, talents: { pocket_shards: 2 } }));
    expect(st.soulShardMax()).toBe(7);
  });

  it('cast de Shadow Bolt gasta mana (costPct de base) y usa accion', () => {
    const manaBefore = st.resourceActual();
    const sb = st.abilityViewModels().find(v => v.ability.id === 'shadow_bolt')!;
    st.castSpell(sb.ability);
    expect(st.actionsUsed()).toBe(1);
    expect(st.resourceActual()).toBeLessThanOrEqual(manaBefore);
  });

  it('talento shadow_mastery multiplica Shadow Bolt via el engine', () => {
    st.character.update(c => ({ ...c, level: 25 }));
    const base = st.abilityViewModels().find(v => v.ability.id === 'shadow_bolt')!;
    st.character.update(c => ({ ...c, talents: { shadow_mastery: 2 } }));
    const boosted = st.abilityViewModels().find(v => v.ability.id === 'shadow_bolt')!;
    expect(boosted.currentMin).toBe(Math.round(base.currentMin * 1.1));
    expect(boosted.currentMax).toBe(Math.round(base.currentMax * 1.1));
  });

  it('xp: curva 400/900/1400 y addXP sube de nivel', () => {
    expect(xpForLevel(1)).toBe(400);
    expect(xpForLevel(2)).toBe(900);
    expect(xpForLevel(3)).toBe(1400);
    st.addXP(400);
    expect(st.character().level).toBe(2);
  });
});
