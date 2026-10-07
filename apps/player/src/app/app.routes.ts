import { Routes } from '@angular/router';
import { PlayerComponent } from './player/player.component';

export const routes: Routes = [
  { path: '', redirectTo: 'player', pathMatch: 'full' },
  { path: 'player', component: PlayerComponent },
];
