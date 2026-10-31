import { Routes } from '@angular/router';
import { LandingComponent } from './pages/landing.component';
import { HomeComponent } from './pages/home.component';
import { JoinComponent } from './pages/join.component';
import { privatePermsetGuard } from './guards/private-permset.guard';

export const routes: Routes = [
  { path: '', component: LandingComponent },
  { path: 'join', component: JoinComponent },
  { path: 'home', component: HomeComponent, canActivate: [privatePermsetGuard] },
  { path: '**', redirectTo: '' },
];
