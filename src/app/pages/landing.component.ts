import { Component, OnInit } from '@angular/core';
import { CommonModule, AsyncPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import {
  OrgConfigService,
  OrgRuntimeConfig,
  PaasUploadedAssetSpec,
} from '../org-config.service';
import { PermsetService } from '../permset.service';

interface HealthStatus {
  status: string;
  stack?: string;
  proxy?: string;
  apiPort?: number;
  mongoConnected: boolean;
  dbName: string;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, AsyncPipe],
  template: `
    <ng-container *ngIf="orgConfig.config$ | async as cfg">
      <!-- Hero Banner -->
      <section class="hero-card">
        <div class="hero-top-badges">
          <span class="badge badge-ok">&#10003; Live on Bookins PaaS</span>
          <span class="badge badge-private">
            {{ cfg.appBlueprint?.archetypeLabel || 'MEAN Stack + Nginx Reverse Proxy' }}
          </span>
          <span
            class="badge"
            [class.badge-ok]="health?.mongoConnected"
            [class.badge-warn]="!health?.mongoConnected"
          >
            {{
              health?.mongoConnected
                ? 'MongoDB Online · ' + health?.dbName
                : 'Isolated Tenant MongoDB · ' + derivedDbName(cfg)
            }}
          </span>
        </div>

        <div class="hero-split" [style.display]="heroAsset(cfg) ? 'grid' : 'block'" style="grid-template-columns: 1.35fr 1fr; gap: 24px; align-items: center;">
          <div>
            <div *ngIf="logoAsset(cfg) as logo" style="margin-bottom: 14px;">
              <img
                [src]="logo.publicUrl || logo.assetPath"
                [alt]="logo.altText || cfg.appName"
                style="max-height: 56px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.14);"
              />
            </div>

            <h1 class="hero-title">
              {{ cfg.appBlueprint?.headline || ('Welcome to ' + cfg.appName) }}
            </h1>
            <p class="hero-subtitle">
              {{ cfg.appBlueprint?.subheadline || cfg.description }}
            </p>
            <p class="muted" style="max-width: 780px; margin: 0 0 12px;">
              <ng-container *ngIf="cfg.appBlueprint?.primaryGoal; else defaultHeroBody">
                {{ cfg.appBlueprint?.primaryGoal }}
              </ng-container>
              <ng-template #defaultHeroBody>
                <strong>{{ cfg.appName }}</strong> is a full-stack MEAN application (MongoDB, Express,
                Angular 18, and Node.js) fronted by an <strong>Nginx</strong> public reverse proxy and
                protected by the <strong>Bookins.io PermSet Protocol</strong>. When you sign in with your
                Grokism handle, your public <strong>amihuman</strong> proof-of-humanity badge and your
                private <strong>{{ cfg.orgName }}</strong> PermSet unlock the protected member workspace
                at <code>{{ cfg.origin }}/home</code> &mdash; with zero PII ever stored in this app.
              </ng-template>
            </p>

            <p
              *ngIf="heroCalloutText(cfg)"
              style="margin: 0 0 16px; padding: 10px 14px; border-radius: 10px; background: rgba(255,255,255,0.06); border-left: 3px solid var(--accent); color: var(--text); font-size: 14px;"
            >
              {{ heroCalloutText(cfg) }}
            </p>

            <div class="hero-meta-strip">
              <div class="meta-chip">
                <span>Public Origin:</span>
                <strong>{{ cfg.origin }}</strong>
              </div>
              <div class="meta-chip">
                <span>Organization:</span>
                <strong>{{ cfg.orgName }}</strong>
              </div>
              <div class="meta-chip">
                <span>Edge Gateway:</span>
                <strong>{{ health?.proxy || 'nginx:80 -> express:3000' }}</strong>
              </div>
              <div class="meta-chip">
                <span>Protected Route:</span>
                <strong>/home (privatePermsetGuard)</strong>
              </div>
            </div>
          </div>

          <div *ngIf="heroAsset(cfg) as heroImg">
            <img
              [src]="heroImg.publicUrl || heroImg.assetPath"
              [alt]="heroImg.altText || cfg.appName"
              style="width: 100%; max-height: 300px; object-fit: cover; border-radius: 14px; border: 1px solid rgba(255,255,255,0.14);"
            />
          </div>
        </div>

        <!-- Dynamic CTA Area based on Auth & PermSet State -->
        <ng-container *ngIf="auth.isAuthenticated$ | async; else loggedOutHero">
          <ng-container *ngIf="permsets.access$ | async as evalState">
            <div class="actions-row" *ngIf="evalState.isAuthorized; else needsMembershipHero">
              <a routerLink="/home">
                <button>
                  Open {{ evalState.activeRoleLabel || 'Protected Member' }} Workspace (/home) &rarr;
                </button>
              </a>
              <a routerLink="/join">
                <button class="secondary">Inspect Membership Status</button>
              </a>
            </div>
            <ng-template #needsMembershipHero>
              <div
                class="permset-entry"
                style="margin-top: 16px; border-color: rgba(245, 158, 11, 0.4);"
              >
                <strong>Signed in, awaiting origin PermSet for {{ cfg.origin }}</strong>
                <p class="permset-explain">
                  Your handle is authenticated, but it does not yet carry a private
                  <strong>{{ cfg.orgName }}</strong> PermSet scoped to
                  <code>{{ cfg.origin }}</code>. Assign one in Bookins.io using
                  <strong>Add Permset</strong>, or self-enroll below.
                </p>
                <div class="actions-row" style="margin-top: 12px;">
                  <a routerLink="/join"><button>Become a Member &rarr;</button></a>
                  <button type="button" class="secondary" (click)="permsets.refresh()">
                    Re-check My Credentials
                  </button>
                </div>
              </div>
            </ng-template>
          </ng-container>
        </ng-container>

        <ng-template #loggedOutHero>
          <div class="paths-grid">
            <div class="path-box path-box-highlight">
              <div>
                <div class="eyebrow">Have a Handle + PermSet?</div>
                <h3>Sign In with the PermSet Protocol</h3>
                <p class="muted">
                  Already created your Bookin and assigned a
                  <strong>{{ cfg.orgName }}</strong> PermSet? Sign in with your handle
                  to go straight to the protected <code>/home</code> workspace.
                </p>
              </div>
              <div class="actions-row">
                <button type="button" (click)="login('/home')">
                  PermSet Member Login &rarr;
                </button>
              </div>
            </div>

            <div class="path-box">
              <div>
                <div class="eyebrow">Self-Service Enrollment</div>
                <h3>New to {{ cfg.appName }}?</h3>
                <p class="muted">
                  Already hold a Grokism handle with an <strong>amihuman</strong> humanity badge?
                  Click <strong>Become a Member</strong> to mint your private
                  <strong>{{ cfg.orgName }}</strong> PermSet on the spot.
                </p>
              </div>
              <div class="actions-row">
                <a routerLink="/join">
                  <button type="button" class="secondary">Become a Member &rarr;</button>
                </a>
              </div>
            </div>
          </div>
        </ng-template>
      </section>

      <!-- Template Questionnaire Highlights Section (Rendered when a Web Template was chosen) -->
      <section
        class="card"
        *ngIf="templateHighlightCards(cfg).length > 0 || templateInfoBanner(cfg)"
      >
        <div class="section-header">
          <div>
            <div class="eyebrow">{{ templateSectionEyebrow(cfg) }}</div>
            <h2>{{ templateSectionTitle(cfg) }}</h2>
          </div>
          <span class="badge badge-ok">Tailored Web Template</span>
        </div>

        <p class="muted" style="margin-top: 0;" *ngIf="templateInfoBanner(cfg)">
          {{ templateInfoBanner(cfg) }}
        </p>

        <div class="feature-grid" *ngIf="templateHighlightCards(cfg).length > 0">
          <div class="feature-tile" *ngFor="let item of templateHighlightCards(cfg); let i = index">
            <div class="tile-kicker">
              <span>{{ templateItemLabel(cfg) }} {{ i + 1 }}</span>
              <code>Verified Access</code>
            </div>
            <h3>{{ item.title }}</h3>
            <p *ngIf="item.detail">{{ item.detail }}</p>
          </div>
        </div>
      </section>

      <!-- Configured PermSet Roles (when custom roles were defined) -->
      <section class="card" *ngIf="cfg.permsetRoles && cfg.permsetRoles.length > 0">
        <div class="section-header">
          <div>
            <div class="eyebrow">Multi-Role PermSet Access Control</div>
            <h2>PermSet Roles Configured for {{ cfg.appName }}</h2>
          </div>
          <span class="badge badge-ok">Zero-PII Sybil Resistance</span>
        </div>
        <p class="muted" style="margin-top: 0;">
          Each role below is minted onto a member's Bookins handle as an origin-scoped private
          PermSet (<code>url = {{ cfg.origin }}</code>) and automatically unlocks its tailored
          workspace view at <code>/home</code>.
        </p>

        <div class="feature-grid">
          <div class="feature-tile" *ngFor="let role of cfg.permsetRoles">
            <div class="tile-kicker">
              <span>
                {{
                  role.enrollmentPolicy === 'self_enroll'
                    ? 'Self-Enroll (/join)'
                    : 'Admin Minted in Bookins.io'
                }}
              </span>
              <code>{{ role.roleKey }}</code>
            </div>
            <h3>{{ role.roleLabel }} PermSet</h3>
            <p>{{ role.purpose }}</p>
            <div *ngIf="role.scopeLabel" class="muted" style="font-size: 12px; margin-top: 6px;">
              Scope Tag: <strong>{{ role.scopeLabel }}</strong>
            </div>
          </div>
        </div>
      </section>

      <!-- Uploaded Visual Gallery (if provided) -->
      <section class="card" *ngIf="galleryAssets(cfg).length > 0">
        <div class="section-header">
          <div>
            <div class="eyebrow">Visual Showcase</div>
            <h2>{{ cfg.appName }} Gallery &amp; Media</h2>
          </div>
        </div>
        <div class="feature-grid">
          <div class="feature-tile" *ngFor="let img of galleryAssets(cfg)">
            <img
              [src]="img.publicUrl || img.assetPath"
              [alt]="img.altText || img.fileName"
              style="width: 100%; height: 170px; object-fit: cover; border-radius: 10px; margin-bottom: 8px;"
            />
            <p style="color: var(--text); font-weight: 600;">{{ img.altText || img.fileName }}</p>
          </div>
        </div>
      </section>

      <!-- Section 1: What Bookins.io Built -->
      <section class="card">
        <div class="section-header">
          <div>
            <div class="eyebrow">Provisioned Stack Architecture</div>
            <h2>What Bookins.io Built for {{ cfg.appName }}</h2>
          </div>
          <span class="badge badge-private">Production-Ready MEAN + Nginx</span>
        </div>

        <div class="workflow-grid" *ngIf="cfg.appBlueprint?.keyFeatures?.length; else defaultStackGrid" style="margin-bottom: 16px;">
          <div class="workflow-step" *ngFor="let feat of cfg.appBlueprint?.keyFeatures; let i = index">
            <div class="step-badge">Feature {{ i + 1 }}</div>
            <p style="color: var(--text); font-size: 14.5px;">{{ feat }}</p>
          </div>
        </div>

        <ng-template #defaultStackGrid>
          <p class="muted" style="margin-top: 0;">
            Unlike a static placeholder page, this deployment is a complete, multi-tier
            <strong>MEAN stack</strong> application running inside the Bookins K3s cluster on the same
            architectural pattern as <code>decenthealth.io</code>, <code>asot.grokism.io</code>, and
            <code>decentshare.io</code>.
          </p>
        </ng-template>

        <div class="feature-grid">
          <div class="feature-tile">
            <div class="tile-kicker">
              <span>1. Public Edge</span>
              <code>nginx :80</code>
            </div>
            <h3>Nginx Front-Door</h3>
            <p>
              Only Nginx on port <code>80</code> is exposed outside the container. It serves the
              compiled Angular 18 SPA bundles and reverse-proxies <code>/api/*</code> calls to the
              internal Express server with <code>32k</code> JWT header buffers.
            </p>
          </div>

          <div class="feature-tile">
            <div class="tile-kicker">
              <span>2. Internal API</span>
              <code>127.0.0.1:3000</code>
            </div>
            <h3>Express + Node.js</h3>
            <p>
              <code>server.mjs</code> runs privately on localhost port <code>3000</code>. Its
              <code>requireOriginPermset</code> middleware verifies Auth0 JWT signatures and confirms
              both public <code>amihuman</code> and private <code>{{ cfg.origin }}</code> PermSets.
            </p>
          </div>

          <div class="feature-tile">
            <div class="tile-kicker">
              <span>3. Tenant Database</span>
              <code>{{ health?.dbName || derivedDbName(cfg) }}</code>
            </div>
            <h3>Isolated MongoDB</h3>
            <p>
              Automatically provisioned on K3s <code>mongodb-0</code> with a dedicated least-privilege
              user injected via K8s Secret <code>paas-db-{{ derivedSlug(cfg) }}</code>. All documents
              are keyed by opaque <code>ps_...</code> handles — zero PII.
            </p>
          </div>

          <div class="feature-tile">
            <div class="tile-kicker">
              <span>4. Protected UI</span>
              <code>/home</code>
            </div>
            <h3>Angular 18 Workspace</h3>
            <p>
              Includes the public landing page (<code>/</code>), self-service enrollment flow
              (<code>/join</code>), top-right <strong>Your Credentials</strong> inspector, and the
              guarded member workspace (<code>/home</code>).
            </p>
          </div>
        </div>
      </section>
    </ng-container>
  `,
})
export class LandingComponent implements OnInit {
  health: HealthStatus | null = null;

  constructor(
    public auth: AuthService,
    public orgConfig: OrgConfigService,
    public permsets: PermsetService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.http.get<HealthStatus>('/api/health').subscribe({
      next: (res) => {
        this.health = res;
      },
      error: () => {
        this.health = null;
      },
    });
  }

  logoAsset(cfg: OrgRuntimeConfig): PaasUploadedAssetSpec | undefined {
    return cfg.appBlueprint?.uploadedAssets?.find((a) => a.slot === 'logo');
  }

  heroAsset(cfg: OrgRuntimeConfig): PaasUploadedAssetSpec | undefined {
    const uploaded = cfg.appBlueprint?.uploadedAssets?.find((a) => a.slot === 'hero');
    if (uploaded) {
      return uploaded;
    }
    const arch = cfg.appBlueprint?.archetype || cfg.archetype || 'default';
    const defaultHeroMap: Record<string, string> = {
      small_business: 'tpl-small-business.jpg',
      daycare_school: 'tpl-daycare-school.jpg',
      ecommerce: 'tpl-ecommerce-store.jpg',
      wellness_clinic: 'tpl-wellness-clinic.jpg',
      dao_governance: 'tpl-community-club.jpg',
      blog_editorial: 'tpl-creator-blog.jpg',
      personal_creator: 'tpl-creator-blog.jpg',
      community_social: 'tpl-community-club.jpg',
    };
    const file = defaultHeroMap[arch] || 'tpl-small-business.jpg';
    return {
      fileName: file,
      assetPath: `assets/templates/${file}`,
      publicUrl: `https://bookins.io/assets/templates/${file}`,
      slot: 'hero',
      altText: `${cfg.appName} Hero`,
    };
  }

  galleryAssets(cfg: OrgRuntimeConfig): PaasUploadedAssetSpec[] {
    return (
      cfg.appBlueprint?.uploadedAssets?.filter(
        (a) => a.slot === 'gallery' || a.slot === 'feature'
      ) || []
    );
  }

  heroCalloutText(cfg: OrgRuntimeConfig): string {
    const a = cfg.appBlueprint?.templateAnswers || {};
    return (
      a['primaryCtaText'] ||
      a['schoolMotto'] ||
      a['memberPerksBanner'] ||
      a['privacyPromise'] ||
      a['communityMission'] ||
      a['subscriberBenefits'] ||
      ''
    );
  }

  templateInfoBanner(cfg: OrgRuntimeConfig): string {
    const a = cfg.appBlueprint?.templateAnswers || {};
    return (
      a['businessHoursAndLocation'] ||
      a['dailyScheduleHighlights'] ||
      a['fulfillmentPolicy'] ||
      a['clinicHoursNote'] ||
      a['meetingCadence'] ||
      a['creatorBio'] ||
      ''
    );
  }

  templateSectionEyebrow(cfg: OrgRuntimeConfig): string {
    const arch = cfg.appBlueprint?.archetype || cfg.archetype || 'default';
    switch (arch) {
      case 'small_business':
        return 'Services & Client Availability';
      case 'daycare_school':
        return 'Classrooms, Programs & Daily Rhythm';
      case 'ecommerce':
        return 'Featured Storefront Catalog & Fulfillment';
      case 'wellness_clinic':
        return 'Practice Specialties & Care Programs';
      case 'dao_governance':
        return 'Community Priorities & Member Governance';
      case 'blog_editorial':
        return 'Featured Columns & Publication Highlights';
      default:
        return 'Featured Highlights';
    }
  }

  templateItemLabel(cfg: OrgRuntimeConfig): string {
    const arch = cfg.appBlueprint?.archetype || cfg.archetype || 'default';
    switch (arch) {
      case 'small_business':
        return 'Service';
      case 'daycare_school':
        return 'Classroom / Program';
      case 'ecommerce':
        return 'Featured Item';
      case 'wellness_clinic':
        return 'Care Specialty';
      case 'dao_governance':
        return 'Priority';
      case 'blog_editorial':
        return 'Series';
      default:
        return 'Highlight';
    }
  }

  templateSectionTitle(cfg: OrgRuntimeConfig): string {
    const arch = cfg.appBlueprint?.archetype || cfg.archetype || 'default';
    switch (arch) {
      case 'small_business':
        return `${cfg.appName} Services & Client Portal`;
      case 'daycare_school':
        return `${cfg.appName} Classrooms & Daily Schedule`;
      case 'ecommerce':
        return `${cfg.appName} Featured Catalog`;
      case 'wellness_clinic':
        return `${cfg.appName} Care Programs & Specialties`;
      case 'dao_governance':
        return `${cfg.appName} Mission & Active Initiatives`;
      case 'blog_editorial':
        return `Inside ${cfg.appName}`;
      default:
        return `${cfg.appName} Overview`;
    }
  }

  templateHighlightCards(cfg: OrgRuntimeConfig): Array<{ title: string; detail: string }> {
    const a = cfg.appBlueprint?.templateAnswers || {};
    const rawList =
      a['servicesOffered'] ||
      a['classroomsServed'] ||
      a['featuredProducts'] ||
      a['practiceSpecialties'] ||
      a['initialProposals'] ||
      a['featuredColumns'] ||
      '';
    return rawList
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line
          .split(/[·—-]/)
          .map((p) => p.trim())
          .filter(Boolean);
        if (parts.length > 1) {
          return { title: parts[0], detail: parts.slice(1).join(' · ') };
        }
        return { title: line, detail: 'Protected by zero-PII PermSet access control.' };
      });
  }

  derivedSlug(cfg: OrgRuntimeConfig): string {
    try {
      const host = new URL(cfg.origin).hostname.toLowerCase();
      if (host.endsWith('.apps.bookins.io')) {
        return host.slice(0, -'.apps.bookins.io'.length) || 'app';
      }
      if (host.endsWith('.bookins.io')) {
        return host.slice(0, -'.bookins.io'.length) || 'app';
      }
      return host.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'app';
    } catch {
      return 'app';
    }
  }

  derivedDbName(cfg: OrgRuntimeConfig): string {
    return `paas_${this.derivedSlug(cfg).replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
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
}
