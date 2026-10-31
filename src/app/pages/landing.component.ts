import { Component } from '@angular/core';
import { CommonModule, AsyncPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { OrgConfigService } from '../org-config.service';
import { PermsetService } from '../permset.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, AsyncPipe],
  template: `
    <div class="card" *ngIf="orgConfig.config$ | async as cfg">
      <div class="eyebrow">Zero-PII PermSet Application · {{ cfg.origin }}</div>
      <h1>Welcome to {{ cfg.appName }}</h1>
      <p class="muted">{{ cfg.description }}</p>
      <p class="muted">
        <strong>{{ cfg.appName }}</strong> uses the Bookins.io PermSet protocol for sybil-resistant,
        zero-PII identity. When you sign in with your Grokism handle, your public
        <strong>Amihuman</strong> proof-of-humanity badge travels across all apps, while your private
        <strong>{{ cfg.orgName }}</strong> membership PermSet unlocks only on
        <code>{{ cfg.origin }}</code> &mdash; without ever exposing your name, email, or home address
        to the application.
      </p>

      <ng-container *ngIf="auth.isAuthenticated$ | async; else loggedOut">
        <ng-container *ngIf="permsets.access$ | async as evalState">
          <div class="actions-row" *ngIf="evalState.isAuthorized; else needsMembership">
            <a routerLink="/home"><button>Open Member Dashboard &rarr;</button></a>
            <a routerLink="/join"><button class="secondary">View Membership Status</button></a>
          </div>
          <ng-template #needsMembership>
            <p class="muted">
              You are signed in, but your handle does not yet carry a private
              <strong>{{ cfg.orgName }}</strong> PermSet for <code>{{ cfg.origin }}</code>.
            </p>
            <div class="actions-row">
              <a routerLink="/join"><button>Become a Member &rarr;</button></a>
            </div>
          </ng-template>
        </ng-container>
      </ng-container>

      <ng-template #loggedOut>
        <div class="paths-grid">
          <div class="path-box">
            <h3>New to {{ cfg.appName }}?</h3>
            <p class="muted">
              Already have a Grokism handle with an <strong>amihuman</strong> humanity badge? Click
              <strong>Become a Member</strong> to sign in and mint your private
              <strong>{{ cfg.orgName }}</strong> PermSet on the spot.
            </p>
            <a routerLink="/join"><button>Become a Member &rarr;</button></a>
          </div>

          <div class="path-box">
            <h3>Already a {{ cfg.appName }} Member?</h3>
            <p class="muted">
              Sign in with your Bookins handle to unlock the protected member dashboard.
            </p>
            <button class="secondary" (click)="login('/home')">Member Login</button>
          </div>
        </div>
      </ng-template>
    </div>
  `,
})
export class LandingComponent {
  constructor(
    public auth: AuthService,
    public orgConfig: OrgConfigService,
    public permsets: PermsetService
  ) {}

  login(target = '/home'): void {
    this.auth
      .loginWithRedirect({
        appState: { target },
        authorizationParams: {
          redirect_uri: window.location.origin,
        },
      })
      .subscribe();
  }
}
