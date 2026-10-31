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
          <a routerLink="/" class="brand-link">
            <strong>{{ cfg.appName }}</strong>
          </a>
          <span class="muted">· powered by bookins.io permsets</span>
        </div>

        <span style="flex:1"></span>

        <ng-container *ngIf="auth.isAuthenticated$ | async; else loggedOut">
          <div class="nav-links" *ngIf="permsets.access$ | async as evalState">
            <a routerLink="/home" class="nav-link">Dashboard</a>
            <a *ngIf="!evalState.hasOriginPermset" routerLink="/join" class="nav-link">
              <button>Become a Member</button>
            </a>

            <!-- Top-right Credentials Dropdown (matching decenthealth & asot-amihuman) -->
            <div class="dropdown-container" *ngIf="auth.user$ | async as user">
              <button
                type="button"
                class="user-toggle"
                (click)="toggleDropdown()"
                [attr.aria-expanded]="isDropdownOpen"
                title="View your credentials"
              >
                <span class="user-handle">&#64;{{ user.nickname || user.name || 'member' }}</span>
                <span class="badge badge-ok" *ngIf="evalState.isHuman">amihuman</span>
                <span class="badge badge-private" *ngIf="evalState.hasOriginPermset">
                  {{ cfg.orgName | lowercase }} · member
                </span>
                <span class="caret" [class.open]="isDropdownOpen">▾</span>
              </button>

              <div class="dropdown-menu permset-dropdown" *ngIf="isDropdownOpen">
                <div class="dropdown-heading">Your Credentials</div>

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
                      <span class="tag tag-private">{{ cfg.orgName | lowercase }} · private</span>
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
                  No permsets disclosed to this origin yet. Use <strong>Become a Member</strong> to
                  mint your private {{ cfg.appName }} credential.
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

            <button class="secondary" (click)="logout()">Log out</button>
          </div>
        </ng-container>

        <ng-template #loggedOut>
          <a routerLink="/join" class="nav-link">Become a Member</a>
          <button (click)="login('/home')">Member Login</button>
        </ng-template>
      </nav>

      <router-outlet></router-outlet>
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
