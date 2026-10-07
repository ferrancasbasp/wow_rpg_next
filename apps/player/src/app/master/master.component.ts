import { Component, inject } from '@angular/core';
import { CombatService } from '../services/combat.service';
import { NPC_REGISTRY } from '../data/npc-registry';
import { ENEMY_DEBUFFS } from '../data/enemy-debuffs';

@Component({
  selector: 'app-master',
  template: `
    <div class="master-page">
      <div class="panel">
        <div class="panel-title">Master — Encuentro</div>
        <div class="panel-body">
          @if (combat.enemy; as enemy) {
            <div class="enemy-card">
              <img [src]="enemy.iconImg" class="enemy-img" (error)="$event.target.style.display = 'none'">
              <div class="enemy-info">
                <div class="enemy-name">{{ enemy.name }}
                  @if (enemy.isElite) { <span class="elite-badge">ÉLITE</span> }
                </div>
                <div class="enemy-meta">Nv {{ enemy.level }} · {{ enemy.zone }}</div>
                <div class="resource-track">
                  <div class="resource-fill hp" [style.width]="hpPercent(enemy) + '%'"></div>
                  <div class="resource-text">{{ enemy.currentHP }} / {{ enemy.maxHP }}</div>
                </div>
                <div class="enemy-meta">Armadura {{ enemy.armor }} · Resistencia {{ enemy.magicResist }} · Turno {{ combat.combat()?.turn }}</div>
                <div class="effect-list">
                  @for (ef of enemy.effects; track ef.id) {
                    <span class="effect-chip" [class.dot]="ef.type === 'dot'">
                      {{ ef.name }} ({{ ef.turnsLeft }}){{ ef.source === 'player' ? ' 🎮' : '' }}
                      <button class="chip-x" (click)="removeEffect(ef.id)">x</button>
                    </span>
                  } @empty {
                    <span class="effect-empty">Sin efectos</span>
                  }
                </div>
              </div>
            </div>
            <div class="master-actions">
              <button class="action-btn" (click)="combat.endTurn()">▶ Fin de turno enemigo</button>
              <button class="action-btn" (click)="combat.healEnemy(250)">↻ Curar 250</button>
              <button class="action-btn danger" (click)="clearEncounter()">Finalizar encuentro</button>
            </div>
          } @else {
            <div class="no-enemy">Sin encuentro activo. Elige un enemigo para empezar.</div>
          }

          <div class="spawn-list">
            <div class="sub-title">Crear encuentro</div>
            <div class="spawn-grid">
              @for (npc of npcList; track npc.id) {
                <div class="spawn-card" (click)="combat.createEncounter(npc)">
                  <img [src]="npc.iconImg" class="spawn-img" (error)="$event.target.style.display = 'none'">
                  <div class="spawn-name">{{ npc.name }}</div>
                  <div class="spawn-meta">Nv {{ npc.level }} · {{ npc.maxHP }} HP</div>
                </div>
              }
            </div>
          </div>

          @if (combat.enemy) {
            <div class="debuff-panel">
              <div class="sub-title">Debuffs sobre el objetivo</div>
              <div class="debuff-grid">
                @for (d of debuffs; track d.name) {
                  <button class="debuff-btn"
                          [disabled]="hasEffect(d.name)"
                          (click)="applyDebuff(d)">
                    {{ d.name }}
                    <span class="debuff-tip">{{ d.description }}</span>
                  </button>
                }
              </div>
            </div>
          }

          <div class="log-box">
            <div class="sub-title">Bitácora</div>
            <div class="log-lines">
              @for (entry of logReversed(); track entry.id) {
                <div class="log-line">{{ entry.text }}</div>
              } @empty {
                <div class="log-empty">Sin eventos todavía.</div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrl: './master.component.css',
})
export class MasterComponent {
  readonly combat = inject(CombatService);
  npcList = NPC_REGISTRY;
  debuffs = ENEMY_DEBUFFS;

  hpPercent(enemy: { currentHP: number; maxHP: number }): number {
    return enemy.maxHP > 0 ? Math.round((enemy.currentHP / enemy.maxHP) * 100) : 0;
  }

  hasEffect(name: string): boolean {
    return !!this.combat.enemy?.effects.some((e) => e.name === name);
  }

  applyDebuff(d: (typeof ENEMY_DEBUFFS)[number]) {
    void this.combat.applyEffect({
      name: d.name,
      type: d.type,
      school: d.school,
      value: d.value,
      target: d.target,
      turnsLeft: d.duration,
    });
  }

  removeEffect(id: string) {
    void this.combat.removeEffect(id);
  }

  clearEncounter() {
    void this.combat.clearEncounter();
  }

  logReversed() {
    return [...(this.combat.combat()?.log || [])].reverse().slice(0, 40);
  }
}
