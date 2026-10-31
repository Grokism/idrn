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
      <div class="eyebrow">IDRN Global Connections · Administrator Portal · {{ cfg.origin }}</div>
      <h1>IDRN Global Connections — Administrator Sign-In</h1>
      <p class="muted">
        Welcome to the <strong>IDRN Global Connections</strong> administrative gateway at
        <code>{{ cfg.origin }}</code>. Access to this portal requires a Bookins handle that holds
        <strong>both</strong>:
      </p>
      <ul class="muted" style="line-height: 1.7; margin-bottom: 16px;">
        <li>
          <strong>Public <code>amihuman</code> PermSet</strong> &mdash; sybil-resistant
          proof-of-humanity verified across the Grokism ecosystem.
        </li>
        <li>
          <strong>Private <code>IDRN Admin</code> PermSet</strong> &mdash; an origin-scoped
          administrative credential minted onto your IDRN Bookin for
          <code>{{ cfg.origin }}</code> (distinct from a Bookins <code>orgAdmin</code>).
        </li>
      </ul>

      <ng-container *ngIf="auth.isAuthenticated$ | async; else loggedOut">
        <ng-container *ngIf="permsets.access$ | async as evalState">
          <div class="actions-row" *ngIf="evalState.isAuthorized; else missingAdminCredentials">
            <a routerLink="/home"><button>Open IDRN Admin Workspace &rarr;</button></a>
          </div>
          <ng-template #missingAdminCredentials>
            <div class="permset-entry" style="margin: 16px 0; padding: 16px;">
              <h3 style="margin-top: 0;">IDRN Administrator Credentials Required</h3>
              <p class="muted" style="margin-bottom: 12px;">
                You are signed in, but this handle does not simultaneously hold both required
                PermSets for <code>{{ cfg.origin }}</code>:
              </p>
              <ul style="list-style: none; padding-left: 0; margin-bottom: 16px;">
                <li style="margin-bottom: 8px;">
                  <span
                    class="badge"
                    [class.badge-ok]="evalState.isHuman"
                    [class.badge-warn]="!evalState.isHuman"
                  >
                    {{ evalState.isHuman ? '✓ Verified' : '✗ Missing' }}
                  </span>
                  <strong style="margin-left: 8px;">Public <code>amihuman</code> PermSet</strong>
                  <span class="muted"> (proof of humanity)</span>
                </li>
                <li>
                  <span
                    class="badge"
                    [class.badge-ok]="evalState.isIdrnAdmin"
                    [class.badge-warn]="!evalState.isIdrnAdmin"
                  >
                    {{ evalState.isIdrnAdmin ? '✓ Verified' : '✗ Missing' }}
                  </span>
                  <strong style="margin-left: 8px;">Private <code>IDRN Admin</code> PermSet</strong>
                  <span class="muted">
                    (origin-scoped to <code>{{ cfg.origin }}</code> from the IDRN org in Bookins)
                  </span>
                </li>
              </ul>
              <p class="muted" style="font-size: 13px; margin-bottom: 14px;">
                To grant administrative access, an IDRN issuer can mint an
                <strong>IDRN Admin</strong> PermSet onto your Bookin in Bookins and bind it to your
                handle.
              </p>
              <div class="actions-row">
                <button type="button" (click)="permsets.refresh()">Re-check Credentials</button>
                <button type="button" class="secondary" (click)="logout()">
                  Sign Out / Switch Handle
                </button>
              </div>
            </div>
          </ng-template>
        </ng-container>
      </ng-container>

      <ng-template #loggedOut>
        <div class="paths-grid">
          <div class="path-box" style="grid-column: 1 / -1;">
            <h3>IDRN Administrator Access</h3>
            <p class="muted">
              Sign in with your Bookins handle carrying both your public
              <strong>amihuman</strong> humanity credential and your private
              <strong>IDRN Admin</strong> PermSet to enter the guarded IDRN Global Connections
              administrator workspace.
            </p>
            <button (click)="login('/home')">IDRN Admin Login &rarr;</button>
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

  logout(): void {
    this.auth
      .logout({
        logoutParams: { returnTo: window.location.origin },
      })
      .subscribe();
  }
}
