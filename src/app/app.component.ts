import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule, AsyncPipe } from '@angular/common';
import { Router, RouterOutlet, RouterLink } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { OrgConfigService, OrgRuntimeConfig } from './org-config.service';
import { Permset, PermsetService } from './permset.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, AsyncPipe],
  template: `
    <div class="container" *ngIf="orgConfig.config$ | async as cfg">
      <nav class="navbar">
        <div class="nav-brand">
          <span class="brand-mark">{{ (cfg.appName || 'B').slice(0, 1) | uppercase }}</span>
          <a routerLink="/" class="brand-link">
            <strong>{{ cfg.appName }}</strong>
          </a>
          <span class="stack-pill" title="MongoDB + Express + Angular + Node fronted by Nginx">
            MEAN + Nginx · Bookins PaaS
          </span>
        </div>

        <span style="flex:1"></span>

        <ng-container *ngIf="auth.isAuthenticated$ | async; else loggedOut">
          <div class="nav-links" *ngIf="permsets.access$ | async as evalState">
            <a routerLink="/" class="nav-link">Overview</a>
            <a routerLink="/home" class="nav-link">Member Workspace</a>
            <a *ngIf="!evalState.hasOriginPermset" routerLink="/join" class="nav-link">
              <button class="btn-sm">Become a Member</button>
            </a>

            <!-- Top-right Credentials Dropdown (matching decenthealth & asot-amihuman) -->
            <div class="dropdown-container" *ngIf="auth.user$ | async as user">
              <button
                type="button"
                class="user-toggle"
                (click)="toggleDropdown()"
                [attr.aria-expanded]="isDropdownOpen"
                title="View your disclosed PermSet credentials"
              >
                <span class="user-handle">&#64;{{ user.nickname || user.name || 'member' }}</span>
                <span class="badge badge-ok" *ngIf="evalState.isHuman">amihuman</span>
                <span class="badge badge-private" *ngIf="evalState.hasOriginPermset">
                  {{ cfg.orgName | lowercase }} · member
                </span>
                <span class="badge badge-warn" *ngIf="!evalState.hasOriginPermset">
                  no origin permset
                </span>
                <span class="caret" [class.open]="isDropdownOpen">▾</span>
              </button>

              <div class="dropdown-menu permset-dropdown" *ngIf="isDropdownOpen">
                <div class="dropdown-heading">Your Disclosed Credentials</div>

                <!-- Public permsets: ecosystem-wide -->
                <div class="dropdown-section" *ngIf="evalState.publicPermsets.length > 0">
                  <div class="section-title">Public — visible across the Grokism ecosystem</div>
                  <div class="permset-entry" *ngFor="let p of evalState.publicPermsets">
                    <div class="permset-name">
                      <code>{{ p.permset }}</code>
                      <span class="tag tag-public">amihuman · human verified</span>
                    </div>
                    <p class="permset-explain">{{ publicExplanation() }}</p>
                  </div>
                </div>

                <!-- Private permsets: origin-scoped -->
                <div class="dropdown-section" *ngIf="evalState.originPrivatePermsets.length > 0">
                  <div class="section-title">
                    Private — disclosed only to {{ cfg.origin }}
                  </div>
                  <div class="permset-entry" *ngFor="let p of evalState.originPrivatePermsets">
                    <div class="permset-name">
                      <code>{{ p.permset }}</code>
                      <span class="tag tag-private">{{ p.description || (cfg.orgName + ' · private') }}</span>
                    </div>
                    <p class="permset-explain">{{ privateExplanation(cfg, p) }}</p>
                  </div>
                </div>

                <div
                  class="dropdown-empty"
                  *ngIf="
                    evalState.publicPermsets.length === 0 &&
                    evalState.originPrivatePermsets.length === 0
                  "
                >
                  No permsets disclosed to this origin yet. Mint a PaaS Member PermSet in
                  <strong>bookins.io</strong> or use <strong>Become a Member</strong> to unlock
                  <code>{{ cfg.origin }}/home</code>.
                </div>

                <div class="sybil-note">
                  <strong>How these work together:</strong> Because your public
                  <a href="https://amihuman.org" target="_blank" rel="noopener">amihuman.org</a>
                  humanity credential and your private <strong>{{ cfg.orgName }}</strong> PermSet
                  are bound to the same pseudonymous handle, <strong>{{ cfg.appName }}</strong>
                  verifies you are an authorized real human without ever receiving your name, email,
                  or street address.
                </div>
              </div>
            </div>

            <button class="secondary btn-sm" (click)="logout()">Log out</button>
          </div>
        </ng-container>

        <ng-template #loggedOut>
          <div class="nav-links">
            <a routerLink="/join" class="nav-link">Become a Member</a>
            <button (click)="login('/home')">PermSet Member Login</button>
          </div>
        </ng-template>
      </nav>

      <main class="main-content">
        <router-outlet></router-outlet>
      </main>

      <footer class="app-footer">
        <div>
          <strong>{{ cfg.appName }}</strong> ({{ cfg.orgName }}) · Origin
          <code>{{ cfg.origin }}</code>
        </div>
        <div>
          Nginx Front-Door (<code>:80</code>) &rarr; Express API (<code>127.0.0.1:3000</code>) &rarr;
          Isolated K3s MongoDB · Powered by
          <a href="https://bookins.io" target="_blank" rel="noopener">bookins.io</a>
        </div>
      </footer>
    </div>
  `,
})
export class AppComponent implements OnInit {
  isDropdownOpen = false;

  constructor(
    public auth: AuthService,
    public orgConfig: OrgConfigService,
    public permsets: PermsetService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.orgConfig.loadRuntimeConfig().subscribe();

    this.auth.appState$.subscribe((appState) => {
      if (appState && appState.target) {
        this.router.navigateByUrl(appState.target);
      }
    });
  }

  toggleDropdown(): void {
    this.isDropdownOpen = !this.isDropdownOpen;
  }

  publicExplanation(): string {
    return (
      'Proof-of-humanity credential issued by amihuman.org: a human verifier personally vouched ' +
      'that a real person stands behind this handle. Because it is public, every application in ' +
      'the Grokism ecosystem can rely on it.'
    );
  }

  privateExplanation(cfg: OrgRuntimeConfig, p: Permset): string {
    return (
      `Private membership credential (${p.description || cfg.appName}) minted onto your handle by ${cfg.orgName}. ` +
      `Because it is origin-scoped to ${cfg.origin}, it is disclosed only to this application; no other site can see it.`
    );
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target && !target.closest('.dropdown-container')) {
      this.isDropdownOpen = false;
    }
  }

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
