import type { PlayerEventType } from './contracts';
import type { PlayerFichaPublic } from './contracts';
import type { PlayerStateSource } from './mappers';
import { applyFicha, buildEvent, toPlayerDoc } from './mappers';

/**
 * Adaptador de persistencia que la app debe proveer (en production: Firestore
 * via SDK de Firebase; en tests: memoria/JSON). Mantiene `projects/state` pura
 * TS y sin dependencias de plataforma.
 */
export interface StateBackend {
  /** Lee la ficha persistida, o null si no existe. */
  fetchFicha(): Promise<PlayerFichaPublic | null>;
  /** Se suscribe a cambios remotos de la ficha. Devuelve unsubscribe. */
  subscribeFicha(cb: (ficha: PlayerFichaPublic | null) => void): () => void;
  /** Guarda la ficha completa (merge). */
  writeFicha(ficha: PlayerFichaPublic): Promise<void>;
  /** Inserta un comando de jugador en la cola de eventos (→ master). */
  pushEvent(e: { playerKey: string; type: PlayerEventType; payload: Record<string, unknown> }): Promise<void>;
}

/** Estado interno del gateway: ficha en signals + cola de eventos + bus de guardado. */
export interface GatewayOptions {
  backend: StateBackend;
  /** Bufete de guardado tras un cambio, p.ej. 30s. 0 = síncrono (tests). */
  saveDebounceMs?: number;
  /** Bufete de drenaje de eventos, p.ej. 500ms. 0 = síncrono. */
  eventFlushMs?: number;
}

export class StateGateway {
  private readonly backend: StateBackend;
  private readonly saveDebounceMs: number;
  private readonly eventFlushMs: number;

  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private eventTimer: ReturnType<typeof setTimeout> | null = null;
  private fichaState: PlayerStateSource | null = null;
  private fichaSub: (() => void) | null = null;
  private destroyed = false;
  private saving = false;
  private dirty = false;

  /** Ficha más reciente conocida (última señal.load o última escritura o último snapshot). */
  ficha: PlayerFichaPublic | null = null;

  constructor(opts: GatewayOptions) {
    this.backend = opts.backend;
    this.saveDebounceMs = opts.saveDebounceMs ?? 30000;
    this.eventFlushMs = opts.eventFlushMs ?? 500;
  }

  /* ================= firmas públicas ================= */

  /** Carga la ficha inicial (Firestore → caché → defaults). Devuelve la ficha final o null. */
  async init(source?: PlayerStateSource): Promise<PlayerFichaPublic | null> {
    if (this.destroyed) return null;
    let ficha: PlayerFichaPublic | null = null;
    try {
      ficha = await this.backend.fetchFicha();
    } catch {
      ficha = null;
    }
    if (ficha) {
      this.ficha = ficha;
      this.fichaState = applyFicha(source || {}, ficha);
    } else if (source) {
      // Primer arranque: la ficha local es la que persistiremos.
      ficha = toPlayerDoc(source);
      this.fichaState = source;
      void this.flushSave();
    } else {
      this.fichaState = null;
    }
    this.subscribe();
    return ficha;
  }

  /** Reescribe el estado del jugador y programa guardado con debounce. */
  updateState(next: PlayerStateSource, opts?: { flush?: boolean }) {
    if (this.destroyed) return;
    this.fichaState = next;
    this.dirty = true;
    if (opts?.flush) {
      void this.flushSave();
    } else {
      this.scheduleSave();
    }
  }

  /** Cambio crítico (subir nivel, equipar, gasto de recurso): flush inmediato. */
  flushNow() {
    if (this.destroyed) return;
    this.clearSaveTimer();
    void this.flushSave();
  }

  /** Aplica la ficha venida de fuera (onSnapshot) a un estado cliente. */
  mergeFicha(ficha: PlayerFichaPublic) {
    if (this.destroyed) return;
    this.ficha = ficha;
    if (this.fichaState) this.fichaState = applyFicha(this.fichaState, ficha);
  }

  /** Emite un comando de jugador hacia la cola events/ (con bufete). */
  emitEvent(playerKey: string, type: PlayerEventType, payload: Record<string, unknown>, opts?: { flush?: boolean }) {
    if (this.destroyed) return;
    const e = buildEvent(playerKey, type, payload);
    if (opts?.flush) {
      void this.drainEvents([e]);
    } else {
      this.eventTimer ??= setTimeout(() => void this.drainEvents([]), this.eventFlushMs);
      this.pending.push(e);
    }
  }

  /** Cierra suscriptores y timers. */
  destroy() {
    this.destroyed = true;
    this.fichaSub?.();
    this.fichaSub = null;
    this.clearSaveTimer();
    if (this.eventTimer) {
      clearTimeout(this.eventTimer);
      this.eventTimer = null;
    }
  }

  readonly isDestroyed = () => this.destroyed;

  /* ================= interno ================= */

  private pending: { playerKey: string; type: PlayerEventType; payload: Record<string, unknown> }[] = [];

  private scheduleSave() {
    this.clearSaveTimer();
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flushSave();
    }, this.saveDebounceMs);
  }

  private clearSaveTimer() {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private async flushSave() {
    if (this.saving || this.destroyed) return;
    this.saving = true;
    this.dirty = false;
    try {
      if (this.fichaState) await this.backend.writeFicha(toPlayerDoc(this.fichaState));
    } catch {
      // Error de red/reglas: se reintenta con el siguiente evento.
    } finally {
      this.saving = false;
    }
  }

  private async drainEvents(extra: { playerKey: string; type: PlayerEventType; payload: Record<string, unknown> }[]) {
    if (this.eventTimer) {
      clearTimeout(this.eventTimer);
      this.eventTimer = null;
    }
    const batch = [...this.pending, ...extra];
    this.pending = [];
    for (const e of batch) {
      try {
        await this.backend.pushEvent(e);
      } catch {
        // Error de red: el evento se pierde salvo cache offline (la app lo gestiona).
      }
    }
  }

  private subscribe() {
    if (this.fichaSub) return;
    this.fichaSub = this.backend.subscribeFicha((ficha) => {
      if (this.destroyed || !ficha) return;
      this.mergeFicha(ficha);
    });
  }
}
