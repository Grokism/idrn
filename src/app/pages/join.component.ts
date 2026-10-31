import { Component, OnInit } from '@angular/core';
import { CommonModule, AsyncPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { PermsetService } from '../permset.service';
import { OrgConfigService } from '../org-config.service';
import {
  EnrollmentDenialReason,
  EnrollmentResult,
  MembershipService,
} from '../membership.service';

export type JoinState =
  | 'intro'
  | 'checking'
  | 'not_registered'
  | 'not_human'
  | 'already_member'
  | 'form'
  | 'submitting'
  | 'success'
  | 'error';

@Component({
  selector: 'app-join',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AsyncPipe],
  template: `
    <div class="card" *ngIf="orgConfig.config$ | async as cfg">
      <div class="eyebrow">{{ cfg.orgName }} · Become a Member</div>

      <!-- Signed out: Two clear paths (just like decenthealth.io/join & grokism.io/join) -->
      <ng-container *ngIf="state === 'intro'">
        <h1>Become a {{ cfg.appName }} Member</h1>
        <p class="muted">
          Membership in <strong>{{ cfg.appName }}</strong> is attached to your
          <strong>Grokism handle</strong>, the Bookins login you use across the Grokism ecosystem,
          and that handle must carry an <strong>amihuman proof-of-humanity</strong> credential: a
          real person has vouched that you are a real person. Your name, email, and home address
          stay inside your isolated Bookins vault while <strong>{{ cfg.appName }}</strong> receives
          only an opaque private PermSet scoped to <code>{{ currentOrigin }}</code>.
        </p>

        <div class="paths-grid">
          <div class="path-box">
            <h3>Already have a Grokism handle?</h3>
            <p class="muted">
              Sign in with it. If your handle carries the <strong>amihuman</strong> credential you
              will land on a short form (name, email, home address) and your private
              <strong>{{ cfg.appName }}</strong> PermSet is created on the spot.
            </p>
            <button type="button" (click)="loginToJoin()">Log in and become a member &rarr;</button>
          </div>

          <div class="path-box">
            <h3>New to Grokism?</h3>
            <ol class="steps-list">
              <li>
                <strong>Get verified as a human at amihuman.org.</strong> Contact a verifier at
                <a href="https://amihuman.org/contact" target="_blank" rel="noopener">amihuman.org/contact</a>
                or email the root verifier directly at
                <a [href]="rootVerifierMailto">{{ rootVerifierEmail }}</a>.
              </li>
              <li>
                <strong>Create your Grokism handle.</strong> Once the verifier attests, Bookins
                emails you a 48-hour registration link. Register at
                <a href="https://register.bookins.io" target="_blank" rel="noopener">register.bookins.io</a>;
                your humanity PermSet is bound to that handle automatically.
              </li>
              <li>
                <strong>Come back here</strong> and click <em>Log in and become a member</em>.
              </li>
            </ol>
          </div>
        </div>
      </ng-container>

      <!-- Checking credentials -->
      <ng-container *ngIf="state === 'checking'">
        <h2>Checking your credentials&hellip;</h2>
        <p class="muted">Reading the PermSets disclosed to <code>{{ currentOrigin }}</code>.</p>
      </ng-container>

      <!-- Already a member in the vault; just needs a fresh login so the claim is in the token -->
      <ng-container *ngIf="state === 'already_member'">
        <h2>Your {{ cfg.appName }} membership is ready</h2>
        <p class="muted">
          Your handle already holds both the public <code>amihuman</code> humanity badge and a
          private <strong>{{ cfg.appName }}</strong> PermSet for <code>{{ currentOrigin }}</code>.
          Click below to refresh your session and open the dashboard.
        </p>
        <div class="actions-row">
          <button type="button" (click)="continueToDashboard()">Open Member Dashboard &rarr;</button>
        </div>
      </ng-container>

      <!-- Not registered with Bookins -->
      <ng-container *ngIf="state === 'not_registered'">
        <h2>This login has no Bookins identity yet</h2>
        <p class="muted">
          <strong>{{ cfg.appName }}</strong> memberships are issued through the Bookins ecosystem.
          Your login is not yet bound to a Bookins account, so there is no place to attach a member
          PermSet.
        </p>
        <div class="actions-row">
          <a href="https://register.bookins.io" target="_blank" rel="noopener">
            <button type="button">Register at register.bookins.io</button>
          </a>
          <button type="button" class="secondary" (click)="logout()">Sign out</button>
        </div>
      </ng-container>

      <!-- No amihuman humanity permset -->
      <ng-container *ngIf="state === 'not_human'">
        <h2>Proof of humanity required</h2>
        <p class="muted">
          <strong>{{ cfg.appName }}</strong> members must hold an <strong>amihuman</strong>
          proof-of-humanity credential. Your login<span *ngIf="username">
            (<code>&#64;{{ username }}</code>)</span>
          does not carry one yet.
        </p>
        <div class="actions-row">
          <a href="https://amihuman.org/contact" target="_blank" rel="noopener">
            <button type="button">Get verified at amihuman.org</button>
          </a>
          <a [href]="rootVerifierMailto">
            <button type="button" class="secondary">Email {{ rootVerifierEmail }}</button>
          </a>
          <button type="button" class="secondary" (click)="evaluate()">Check again</button>
          <button type="button" class="secondary" (click)="logout()">Sign out</button>
        </div>
      </ng-container>

      <!-- Self-Service Enrollment Form -->
      <ng-container *ngIf="state === 'form' || state === 'submitting'">
        <h1>Become a {{ cfg.appName }} Member</h1>
        <p class="muted">
          <span class="badge badge-ok" style="margin-right:8px">&#10003; amihuman verified</span>
          Your humanity credential checks out<span *ngIf="username">
            for <strong>&#64;{{ username }}</strong></span>.
          Complete your Bookins vault details below to mint your private
          <strong>{{ cfg.appName }}</strong> PermSet for <code>{{ currentOrigin }}</code> on the spot.
        </p>

        <form class="join-form" (ngSubmit)="submit()">
          <div class="form-row two-col">
            <label>
              <span>First name *</span>
              <input
                type="text"
                name="firstName"
                autocomplete="given-name"
                required
                [(ngModel)]="form.firstName"
                [disabled]="state === 'submitting'"
              />
            </label>
            <label>
              <span>Last name *</span>
              <input
                type="text"
                name="lastName"
                autocomplete="family-name"
                required
                [(ngModel)]="form.lastName"
                [disabled]="state === 'submitting'"
              />
            </label>
          </div>

          <label>
            <span>Email *</span>
            <input
              type="email"
              name="email"
              autocomplete="email"
              required
              [(ngModel)]="form.email"
              [disabled]="state === 'submitting'"
            />
          </label>

          <label>
            <span>Street address *</span>
            <input
              type="text"
              name="street"
              autocomplete="address-line1"
              required
              placeholder="123 Main St"
              [(ngModel)]="form.street"
              [disabled]="state === 'submitting'"
            />
          </label>

          <div class="form-row three-col">
            <label>
              <span>City *</span>
              <input
                type="text"
                name="city"
                autocomplete="address-level2"
                required
                [(ngModel)]="form.city"
                [disabled]="state === 'submitting'"
              />
            </label>
            <label>
              <span>State *</span>
              <input
                type="text"
                name="state"
                autocomplete="address-level1"
                maxlength="20"
                required
                placeholder="MN"
                [(ngModel)]="form.state"
                [disabled]="state === 'submitting'"
              />
            </label>
            <label>
              <span>ZIP *</span>
              <input
                type="text"
                name="zipCode"
                autocomplete="postal-code"
                required
                placeholder="55101"
                [(ngModel)]="form.zipCode"
                [disabled]="state === 'submitting'"
              />
            </label>
          </div>

          <label class="consent-row">
            <input
              type="checkbox"
              name="notifyByEmail"
              [(ngModel)]="form.notifyByEmail"
              [disabled]="state === 'submitting'"
            />
            <span class="muted">
              Allow {{ cfg.appName }} to send notifications to my email via Bookins.
              {{ cfg.appName }} never sees my email address; Bookins delivers messages on its behalf.
            </span>
          </label>

          <p class="error-banner" role="alert" *ngIf="fieldError">{{ fieldError }}</p>

          <div class="actions-row">
            <button type="submit" [disabled]="!canSubmit || state === 'submitting'">
              {{ state === 'submitting' ? 'Minting your private PermSet…' : 'Create my membership' }}
            </button>
            <button
              type="button"
              class="secondary"
              (click)="logout()"
              [disabled]="state === 'submitting'"
            >
              Cancel
            </button>
          </div>
        </form>

        <p class="muted" style="font-size: 13px; margin-top: 18px;">
          <strong>Zero-PII Architecture:</strong> Your name, email, and street address are stored
          solely inside your Bookins vault, operated by Grokism LLC. <strong>{{ cfg.appName }}</strong>
          receives only an opaque private credential (<code>ps_...</code>) bound to your handle.
        </p>
      </ng-container>

      <!-- Success -->
      <ng-container *ngIf="state === 'success'">
        <h1>You are a {{ cfg.appName }} Member</h1>
        <p class="muted" *ngIf="result?.alreadyMember">
          A membership PermSet was already on your account. We will refresh your sign-in so it
          appears in your session token.
        </p>
        <p class="muted" *ngIf="!result?.alreadyMember">
          Your private <strong>{{ cfg.appName }}</strong> PermSet scoped to
          <code>{{ currentOrigin }}</code> has been minted and bound to your handle.
        </p>
        <div class="actions-row">
          <button type="button" (click)="continueToDashboard()">
            Continue to your dashboard &rarr;
          </button>
        </div>
        <p class="muted" style="font-size: 13px; margin-top: 12px;">
          We will send you through sign-in once so the Auth0 Post-Login Action injects your new
          private PermSet into your token.
        </p>
      </ng-container>

      <!-- Error -->
      <ng-container *ngIf="state === 'error'">
        <h2>We could not finish your enrollment</h2>
        <p class="error-banner" role="alert">{{ errorMessage }}</p>
        <div class="actions-row">
          <button type="button" (click)="retry()">Try again</button>
          <button type="button" class="secondary" (click)="logout()">Sign out</button>
        </div>
      </ng-container>
    </div>
  `,
})
export class JoinComponent implements OnInit {
  currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
  readonly rootVerifierEmail = 'iam@amihuman.org';
  readonly rootVerifierMailto = `mailto:iam@amihuman.org?subject=${encodeURIComponent(
    'amihuman verification request'
  )}`;

  state: JoinState = 'checking';
  errorMessage = '';
  fieldError = '';
  username = '';
  result: EnrollmentResult | null = null;

  form = {
    firstName: '',
    lastName: '',
    email: '',
    street: '',
    city: '',
    state: 'MN',
    zipCode: '',
    notifyByEmail: true,
  };

  constructor(
    public auth: AuthService,
    public permsets: PermsetService,
    public orgConfig: OrgConfigService,
    private membership: MembershipService,
    private router: Router
  ) {}

  async ngOnInit(): Promise<void> {
    await firstValueFrom(
      this.auth.isLoading$.pipe(
        filter((loading) => !loading),
        take(1)
      )
    );
    const isAuthenticated = await firstValueFrom(this.auth.isAuthenticated$.pipe(take(1)));
    if (!isAuthenticated) {
      this.state = 'intro';
      return;
    }
    await this.evaluate();
  }

  loginToJoin(): void {
    this.auth
      .loginWithRedirect({
        appState: { target: '/join' },
        authorizationParams: {
          redirect_uri: window.location.origin,
        },
      })
      .subscribe();
  }

  async evaluate(): Promise<void> {
    this.state = 'checking';
    this.fieldError = '';
    this.errorMessage = '';

    // 1. Check what the current token / live dapp endpoint discloses
    let claimHuman = false;
    let claimMember = false;
    try {
      const evalState = await firstValueFrom(this.permsets.access$.pipe(take(1)));
      claimHuman = evalState.isHuman;
      claimMember = evalState.hasOriginPermset;
    } catch {
      // Fall through to registry check
    }

    if (claimHuman && claimMember) {
      this.state = 'already_member';
      await this.router.navigate(['/home']);
      return;
    }

    // 2. Registry-authoritative status from bookins.io
    try {
      const status = await this.membership.getStatus(this.currentOrigin);
      this.username = status.username || '';
      if (status.member && (status.human || claimHuman)) {
        this.state = 'already_member';
        return;
      }
      if (!status.registered && !claimHuman) {
        this.state = 'not_registered';
        return;
      }
      if (!status.human && !claimHuman) {
        this.state = 'not_human';
        return;
      }
      if (status.emails?.length && !this.form.email) {
        this.form.email = status.emails[0];
      }
      this.state = 'form';
    } catch (err) {
      console.warn('Membership status check fallback to token claim:', err);
      this.state = claimHuman ? 'form' : 'not_human';
    }
  }

  get canSubmit(): boolean {
    const f = this.form;
    return Boolean(
      f.firstName.trim() &&
        f.lastName.trim() &&
        f.email.trim() &&
        f.street.trim() &&
        f.city.trim() &&
        f.state.trim() &&
        f.zipCode.trim()
    );
  }

  async submit(): Promise<void> {
    if (!this.canSubmit || this.state === 'submitting') return;
    this.state = 'submitting';
    this.fieldError = '';
    this.errorMessage = '';

    try {
      this.result = await this.membership.enroll({
        origin: this.currentOrigin,
        firstName: this.form.firstName.trim(),
        lastName: this.form.lastName.trim(),
        email: this.form.email.trim(),
        homeAddress: {
          street: this.form.street.trim(),
          city: this.form.city.trim(),
          state: this.form.state.trim(),
          zipCode: this.form.zipCode.trim(),
        },
        notifyByEmail: this.form.notifyByEmail,
      });
      this.permsets.refresh();
      this.state = 'success';
    } catch (err) {
      this.handleEnrollError(err);
    }
  }

  private handleEnrollError(err: unknown): void {
    const http = err as HttpErrorResponse;
    const reason = (http?.error?.reason as EnrollmentDenialReason | undefined) || undefined;
    const message = (http?.error?.error as string | undefined) || '';

    switch (reason) {
      case 'not_human':
        this.state = 'not_human';
        return;
      case 'not_registered':
        this.state = 'not_registered';
        return;
      case 'invalid_address':
        this.fieldError = message || 'Please check your street, city, state, and ZIP code.';
        this.state = 'form';
        return;
      default:
        break;
    }

    if (http?.status === 400) {
      this.fieldError = message || 'Please check all required fields and try again.';
      this.state = 'form';
      return;
    }
    if (http?.status === 429) {
      this.errorMessage = 'Too many attempts. Please wait a few minutes and try again.';
    } else {
      this.errorMessage =
        message || 'Something went wrong while creating your membership. Please try again.';
    }
    this.state = 'error';
  }

  continueToDashboard(): void {
    this.permsets.refresh();
    this.router.navigate(['/home']);
  }

  retry(): void {
    this.state = 'form';
    this.errorMessage = '';
  }

  logout(): void {
    this.auth
      .logout({ logoutParams: { returnTo: window.location.origin } })
      .subscribe();
  }
}
