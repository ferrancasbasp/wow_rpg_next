import { effect, inject, Injectable, signal } from '@angular/core';
import { StateGateway } from '@state/gateway';
import type { PlayerFichaPublic } from '@state/contracts';
import type { PlayerStateSource } from '@state/mappers';
import { PLAYER_KEY } from './firebase.config';
import { RtdbStateBackend, type PlayerProfile } from './rtdb-sync.service';
import { PlayerStateService } from './player-state.service';

/** Campos cuya mutación exige persistencia inmediata (flush, no debounce). */
const CRITICAL_FIELDS = ['name', 'classKey', 'level', 'talents', 'capstone', 'trainedRanks', 'raidSymbol', 'equipment'];

@Injectable({ providedIn: 'root' })
export class SyncService {
  private readonly st = inject(PlayerStateService);
  private backend: RtdbStateBackend = new RtdbStateBackend();
  private gw = new StateGateway({ backend: this.backend });

  /** Perfil activo (jugador al que se escribe). */
  private activeKey = PLAYER_KEY;

  /** Estado de la conexión con la base de datos (RTDB) para la UI. */
  readonly status = signal<'loading' | 'online' | 'offline'>('loading');

  /** Ficha activa resuelta por el gateway (local + remota). */
  readonly activeFicha = signal<PlayerFichaPublic | null>(null);

  /** Perfiles disponibles en la BD (selector de 'Cargar'). */
  readonly profiles = signal<PlayerProfile[]>([]);

  /** Fecha (server) de la última sincronización satisfactoria. */
  readonly lastSavedAt = signal<unknown>(null);

  private lastKey = '';
  private lastCritical = '';
  private ready = false;

  constructor() {
    effect(() => {
      const _ = this.st.character();
      this.track();
    });
    this.st.playerEvents.subscribe((e) => this.gw.emitEvent(this.activeKey, e.type, e.payload, { flush: true }));
    void this.init();
  }

  private async init() {
    try {
      const source = this.st.persistibleFicha() as unknown as PlayerStateSource;
      const ficha = await this.gw.init(source);
      if (ficha) {
        this.st.applyRemoteFicha(ficha);
        this.activeFicha.set(ficha);
        this.status.set('online');
      } else {
        this.activeFicha.set(this.st.persistibleFicha());
        this.st.trainAll();
        this.status.set('online');
      }
    } catch {
      this.status.set('offline');
    } finally {
      this.ready = true;
    }
  }

  /** Lee de la BD la lista de perfiles (party/{partida}/players). */
  async refreshProfiles(): Promise<void> {
    try {
      this.profiles.set(await this.backend.listPlayers());
    } catch {
      this.profiles.set([]);
    }
  }

  /** Cambia el perfil activo: rebinde el backend al jugador elegido y recarga su ficha. */
  async loadProfile(playerKey: string): Promise<void> {
    if (playerKey === this.activeKey) {
      this.st.showToast('Ya estás en ese perfil');
      return;
    }
    this.gw.destroy();
    this.backend = new RtdbStateBackend(playerKey);
    this.gw = new StateGateway({ backend: this.backend });
    this.activeKey = playerKey;
    this.status.set('loading');
    try {
      const source = this.st.persistibleFicha() as unknown as PlayerStateSource;
      const ficha = await this.gw.init(source);
      this.status.set('online');
      if (ficha) {
        this.st.applyRemoteFicha(ficha);
        this.activeFicha.set(ficha);
      } else {
        this.activeFicha.set(this.st.persistibleFicha());
      }
      this.st.trainAll();
      this.st.healToFull();
      this.st.turnNumber.set(1);
      this.st.actionsUsed.set(0);
      this.st.showToast('📂 Perfil cargado: ' + (ficha?.name || playerKey));
    } catch {
      this.status.set('offline');
      this.st.showToast('Error al cargar el perfil');
    }
  }

  private track() {
    const persistible = this.st.persistibleFicha();
    const key = JSON.stringify(persistible);
    if (key === this.lastKey) return;

    const rec = persistible as unknown as Record<string, unknown>;
    const criticalKey = CRITICAL_FIELDS.map((f) => `${f}:${JSON.stringify(rec[f])}`).join(';');
    const critical = criticalKey !== this.lastCritical;
    this.lastKey = key;
    this.lastCritical = criticalKey;

    this.activeFicha.set(persistible);
    this.gw.updateState(persistible as unknown as PlayerStateSource, { flush: critical });
    if (critical && this.ready) this.st.showToast('💾 Guardado');
  }

  /** Guarda inmediatamente (botón o cambios críticos explícitos). */
  flushNow() {
    this.gw.flushNow();
    this.st.showToast('💾 Guardado');
  }
}
