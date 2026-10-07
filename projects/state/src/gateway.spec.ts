import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StateGateway, type StateBackend } from './gateway';
import { toPlayerDoc, applyFicha, buildEvent, eventDoc } from './mappers';
import type { PlayerFichaPublic } from './contracts';
import type { PlayerStateSource } from './mappers';
import type { PlayerEventType } from './contracts';

function makeBackend(initial?: PlayerFichaPublic | null) {
  const db: { ficha: PlayerFichaPublic | null; events: { playerKey: string; type: PlayerEventType; payload: Record<string, unknown> }[] } = {
    ficha: initial ?? null,
    events: [],
  };
  const writeFicha = vi.fn(async (ficha: PlayerFichaPublic) => {
    db.ficha = ficha;
  });
  const pushEvent = vi.fn(async (e: { playerKey: string; type: PlayerEventType; payload: Record<string, unknown> }) => {
    db.events.push(e);
  });
  const listeners: ((f: PlayerFichaPublic | null) => void)[] = [];
  const backend: StateBackend = {
    fetchFicha: async () => db.ficha,
    subscribeFicha: (cb) => {
      listeners.push(cb);
      return () => {
        const i = listeners.indexOf(cb);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    writeFicha,
    pushEvent,
  };
  const notify = (f: PlayerFichaPublic | null) => listeners.forEach((cb) => cb(f));
  return { db, writeFicha, pushEvent, backend, notify };
}

const sampleSource = (): PlayerStateSource => ({
  name: 'Aranir',
  classKey: 'warlock',
  level: 1,
  baseStats: { fuerza: 10, agilidad: 10 },
  talents: {},
  capstone: null,
  currentXP: 0,
  trainedRanks: {},
  equipment: {},
  images: { horizontal: '', vertical: '' },
  raidSymbol: null,
});

describe('mappers', () => {
  it('toPlayerDoc extrae solo campos persistibles y aplana los restantes', () => {
    const doc = toPlayerDoc({
      ...sampleSource(),
      currentHP: 1300,
      currentMana: 700,
      activeEffects: [{ name: 'x' }],
      activePet: { petId: 'voidwalker', currentHP: 10, currentMana: 5 },
      currentCooldowns: { shadow_bolt: 1 },
      turnNumber: 7,
    });
    expect(doc).toEqual({
      name: 'Aranir',
      classKey: 'warlock',
      level: 1,
      baseStats: { fuerza: 10, agilidad: 10 },
      talents: {},
      capstone: null,
      currentXP: 0,
      trainedRanks: {},
      equipment: {},
      images: { horizontal: '', vertical: '' },
      raidSymbol: null,
    });
    expect('currentHP' in doc).toBe(false);
    expect('currentMana' in doc).toBe(false);
    expect('activeEffects' in doc).toBe(false);
  });

  it('applyFicha sobrescribe estado con la ficha remota', () => {
    const ficha: PlayerFichaPublic = { ...sampleSource(), level: 12, currentXP: 150, talents: { ruina: 3 } } as PlayerFichaPublic;
    const merged = applyFicha({ ...sampleSource(), currentHP: 999 }, ficha);
    expect(merged.level).toBe(12);
    expect(merged.talents).toEqual({ ruina: 3 });
    expect(merged.currentXP).toBe(150);
    expect(merged.currentHP).toBe(999);
  });

  it('buildEvent sanitiza payload y exige playerKey', () => {
    const e = buildEvent('aranir', 'lanzarHabilidad', { abilityId: 'shadow_bolt', rank: 2 });
    expect(e).toEqual({ playerKey: 'aranir', type: 'lanzarHabilidad', payload: { abilityId: 'shadow_bolt', rank: 2 } });
    expect(() => buildEvent('', 'mover', {})).toThrow();
  });

  it('eventDoc añade el serverTimestamp', () => {
    const ts = { seconds: 1, nanos: 0 };
    const e = eventDoc(buildEvent('aranir', 'mover', { x: 1 }), ts);
    expect(e.ts).toBe(ts);
  });
});

describe('StateGateway', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('init sin ficha remota usa el estado local como primera persistencia (crea el doc)', async () => {
    const { backend, writeFicha, db } = makeBackend(null);
    const gw = new StateGateway({ backend, saveDebounceMs: 100, eventFlushMs: 50 });
    const ficha = await gw.init(sampleSource());
    expect(ficha).toBeTruthy();
    expect(ficha!.name).toBe('Aranir');
    await vi.advanceTimersByTimeAsync(0);
    expect(writeFicha).toHaveBeenCalledTimes(1);
    expect(db.ficha!.classKey).toBe('warlock');
    gw.destroy();
    vi.useRealTimers();
  });

  it('init con ficha remota la devuelve y la aplica al estado', async () => {
    const remote: PlayerFichaPublic = { ...sampleSource(), level: 30, capstone: 'ruina' } as PlayerFichaPublic;
    const { backend } = makeBackend(remote);
    const gw = new StateGateway({ backend, saveDebounceMs: 100 });
    const ficha = await gw.init(sampleSource());
    expect(ficha!.level).toBe(30);
    expect(gw.ficha!.capstone).toBe('ruina');
    gw.destroy();
    vi.useRealTimers();
  });

  it('guardado con debounce: no escribe hasta que pasa el delay', async () => {
    const remote: PlayerFichaPublic = { ...sampleSource(), level: 1 } as PlayerFichaPublic;
    const { backend, writeFicha } = makeBackend(remote);
    const gw = new StateGateway({ backend, saveDebounceMs: 100 });
    await gw.init(sampleSource());
    expect(writeFicha).not.toHaveBeenCalled();
    gw.updateState({ ...sampleSource(), level: 2 });
    await vi.advanceTimersByTimeAsync(50);
    expect(writeFicha).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60);
    expect(writeFicha).toHaveBeenCalledTimes(1);
    expect((writeFicha.mock.calls[0][0] as PlayerFichaPublic).level).toBe(2);
    gw.destroy();
    vi.useRealTimers();
  });

  it('flushNow escribe de inmediato (cambios críticos)', async () => {
    const remote: PlayerFichaPublic = { ...sampleSource(), level: 1 } as PlayerFichaPublic;
    const { backend, writeFicha } = makeBackend(remote);
    const gw = new StateGateway({ backend, saveDebounceMs: 30000 });
    await gw.init(sampleSource());
    gw.updateState({ ...sampleSource(), level: 12 });
    gw.flushNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(writeFicha).toHaveBeenCalledTimes(1);
    expect((writeFicha.mock.calls[0][0] as PlayerFichaPublic).level).toBe(12);
    gw.destroy();
    vi.useRealTimers();
  });

  it('emitEvent encola y drena en bufete; flush=true drena al momento', async () => {
    const { backend, pushEvent } = makeBackend(null);
    const gw = new StateGateway({ backend, eventFlushMs: 50 });
    gw.emitEvent('aranir', 'lanzarHabilidad', { abilityId: 'shadow_bolt' });
    gw.emitEvent('aranir', 'mover', {});
    await vi.advanceTimersByTimeAsync(10);
    expect(pushEvent).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(50);
    expect(pushEvent).toHaveBeenCalledTimes(2);
    expect(pushEvent.mock.calls[0][0]).toMatchObject({ type: 'lanzarHabilidad', payload: { abilityId: 'shadow_bolt' } });
    gw.emitEvent('aranir', 'equipar', { itemId: 'espada' }, { flush: true });
    await vi.advanceTimersByTimeAsync(0);
    expect(pushEvent).toHaveBeenCalledTimes(3);
    gw.destroy();
    vi.useRealTimers();
  });

  it('el snapshot remoto (onSnapshot) se ve a través de mergeFicha', async () => {
    const { backend, notify } = makeBackend(null);
    const gw = new StateGateway({ backend, saveDebounceMs: 100 });
    const ficha = await gw.init(sampleSource());
    expect(ficha!.level).toBe(1);
    const remote: PlayerFichaPublic = { ...sampleSource(), level: 42 } as PlayerFichaPublic;
    notify(remote);
    expect(gw.ficha!.level).toBe(42);
    gw.destroy();
    vi.useRealTimers();
  });

  it('destroy limpia timers y suscripción', async () => {
    const remoteInit: PlayerFichaPublic = { ...sampleSource(), level: 1 } as PlayerFichaPublic;
    const { backend, writeFicha, notify } = makeBackend(remoteInit);
    const gw = new StateGateway({ backend, saveDebounceMs: 100 });
    await gw.init(sampleSource());
    expect(gw.ficha!.level).toBe(1);
    gw.updateState({ ...sampleSource(), level: 5 });
    gw.destroy();
    await vi.advanceTimersByTimeAsync(5000);
    expect(writeFicha).not.toHaveBeenCalled();
    const remote: PlayerFichaPublic = { ...sampleSource(), level: 99 } as PlayerFichaPublic;
    notify(remote);
    // Destroy: los snapshots posteriores no se aplican (se mantiene la ficha cargada).
    expect(gw.ficha!.level).toBe(1);
    expect(gw.isDestroyed()).toBe(true);
    vi.useRealTimers();
  });
});
