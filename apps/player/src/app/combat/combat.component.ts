import { Component, inject } from '@angular/core';
import { CombatService } from '../services/combat.service';

@Component({
  selector: 'app-combat',
  template: `
    <div class="combat-page">
      <div class="panel">
        <div class="panel-title">Combate — Pizarra de la partida</div>
        <div class="panel-body">
          @if (combat.enemy; as enemy) {
            <div class="board">
              <div class="turn-banner">Turno {{ combat.combat()?.turn }}</div>
              <div class="enemy-col">
                <img [src]="enemy.iconImg" class="enemy-img" (error)="$event.target.style.display = 'none'">
              </div>
              <div class="target-col">
                <div class="enemy-name">{{ enemy.name }} @if (enemy.isElite) { <span class="elite-badge">ÉLITE</span> }</div>
                <div class="enemy-meta">Nv {{ enemy.level }} · {{ enemy.zone }}</div>
                <div class="resource-track">
                  <div class="resource-fill hp" [style.width]="hpPct(enemy) + '%'" [class.low]="hpPct(enemy) < 25"></div>
                  <div class="resource-text">{{ enemy.currentHP }} / {{ enemy.maxHP }}</div>
                </div>
                <div class="armor-row">🛡️ {{ enemy.armor }} · ✨ {{ enemy.magicResist }}</div>
                <div class="effect-list">
                  @for (ef of enemy.effects; track ef.id) {
                    <span class="effect-chip" [class.dot]="ef.type === 'dot'">
                      {{ ef.name }} ({{ ef.turnsLeft }}){{ ef.source === 'player' ? ' 🎮' : '' }}
                    </span>
                  } @empty {
                    <span class="effect-empty">Sin efectos sobre el objetivo</span>
                  }
                </div>
              </div>
            </div>
          } @else {
            <div class="no-combat">No hay encuentro activo. El master debe iniciar uno.</div>
          }

          <div class="log-box">
            <div class="sub-title">Bitácora</div>
            <div class="log-lines">
              @for (entry of combat.combat()?.log?.slice().reverse(); track entry.id) {
                <div class="log-line">{{ entry.text }}</div>
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrl: './combat.component.css',
})
export class CombatComponent {
  readonly combat = inject(CombatService);

  hpPct(enemy: { currentHP: number; maxHP: number }): number {
    return enemy.maxHP > 0 ? Math.round((enemy.currentHP / enemy.maxHP) * 100) : 0;
  }
}
