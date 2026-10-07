import { Routes } from '@angular/router';
import { PlayerComponent } from './player/player.component';
import { MasterComponent } from './master/master.component';
import { CombatComponent } from './combat/combat.component';

export const routes: Routes = [
  { path: '', redirectTo: 'player', pathMatch: 'full' },
  { path: 'player', component: PlayerComponent },
  { path: 'master', component: MasterComponent },
  { path: 'combat', component: CombatComponent },
];
