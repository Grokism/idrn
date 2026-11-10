import { Component, OnInit } from '@angular/core';
import { CommonModule, AsyncPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { PermsetService } from '../permset.service';
import { OrgConfigService, OrgRuntimeConfig } from '../org-config.service';

export interface MemberRecord {
  _id?: string;
  permset: string;
  origin: string;
  title: string;
  category: string;
  notes: string;
  roleKey?: string;
  roleLabel?: string;
  scopeTag?: string;
  createdAt: string;
}

interface HealthResponse {
  status: string;
  stack?: string;
  proxy?: string;
  apiPort?: number;
  mongoConnected: boolean;
  dbName: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, AsyncPipe, DatePipe],
  template: `
    <div *ngIf="orgConfig.config$ | async as cfg">
      <!-- 1. Authenticated Session & Live MEAN + Nginx Telemetry Card -->
      <section class="hero-card" style="padding: 28px 30px;">
        <div class="hero-top-badges">
          <span class="badge badge-ok">&#10003; Guarded Member Route (/home)</span>
          <span class="badge badge-private">
            Active Role: {{ activeRoleLabel || (memberRole === 'admin' ? cfg.appName + ' Admin' : cfg.appName + ' Member') }}
          </span>
          <span class="badge badge-ok" *ngIf="activeScopeTag">
            Scope Tag: {{ activeScopeTag }}
          </span>
          <span class="badge badge-ok">
            Edge Proxy: {{ proxyRoute || 'nginx:80 -> express:3000' }}
          </span>
          <span
            class="badge"
            [class.badge-ok]="dbConnected"
            [class.badge-warn]="!dbConnected"
          >
            {{ dbConnected ? 'MongoDB Connected · ' + dbName : 'Checking MongoDB…' }}
          </span>
        </div>

        <h1 class="hero-title" style="font-size: 28px; margin-bottom: 8px;">
          {{ cfg.appName }} — {{ activeRoleLabel || 'Protected Member' }} Workspace
        </h1>
        <p class="muted" style="margin: 0;" *ngIf="auth.user$ | async as user">
          Signed in as <strong>&#64;{{ user.nickname || user.name || user.sub }}</strong> on
          <code>{{ cfg.origin }}</code>. Both your public <strong>amihuman</strong> humanity badge
          and your private <strong>{{ cfg.orgName }}</strong> PermSet were verified by
          <code>privatePermsetGuard</code> (Angular) and <code>requireOriginPermset</code>
          (Express).
        </p>

        <!-- Configured PermSet Roles Inspector (when roles are defined) -->
        <div class="telemetry-grid" style="margin-top: 16px;" *ngIf="cfg.permsetRoles && cfg.permsetRoles.length > 0">
          <div class="telemetry-item" *ngFor="let r of cfg.permsetRoles">
            <div class="telemetry-label">
              {{ r.roleLabel }} (<code>{{ r.roleKey }}</code>)
              <span *ngIf="r.roleKey === activeRoleKey" class="badge badge-ok" style="margin-left: 6px;">
                Active
              </span>
            </div>
            <div class="telemetry-value" style="font-weight: 400; font-size: 13px; color: var(--muted);">
              {{ r.purpose }}
            </div>
          </div>
        </div>
      </section>

      <!-- 2. Live MEAN Stack MongoDB Workspace (/api/records) -->
      <section class="card">
        <div class="section-header">
          <div>
            <div class="eyebrow">
              {{ activeRoleLabel || 'Member' }} Activity &amp; Zero-PII MongoDB Storage · /api/records
            </div>
            <h2>
              {{
                activeScopeTag
                  ? cfg.appName + ' Items for Scope "' + activeScopeTag + '"'
                  : cfg.appName + ' Member Records'
              }}
            </h2>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <button
              type="button"
              class="secondary btn-sm"
              (click)="seedSampleRecord(cfg)"
              [disabled]="isSaving"
            >
              + Seed Sample Record
            </button>
            <button
              type="button"
              class="secondary btn-sm"
              (click)="loadRecords()"
              [disabled]="isLoading"
            >
              {{ isLoading ? 'Refreshing…' : 'Refresh' }}
            </button>
          </div>
        </div>

        <p class="muted" style="font-size: 14px; margin-top: 0;">
          Every record created below is verified against your Auth0 JWT + PermSet claims and stored
          in your isolated K3s MongoDB database (<code>{{ dbName || derivedDbName(cfg) }}</code>)
          keyed strictly by your opaque PermSet handle
          <code *ngIf="activePermset">{{ activePermset }}</code> &mdash; never by your name or email.
        </p>

        <form class="join-form" (ngSubmit)="createRecord()" style="margin-bottom: 22px;">
          <div class="form-row">
            <label style="flex: 2;">
              <span>Title / Update Headline *</span>
              <input
                type="text"
                name="newTitle"
                [(ngModel)]="newTitle"
                placeholder="Enter a title, milestone, or item name"
                required
                [disabled]="isSaving"
              />
            </label>
            <label style="flex: 1;">
              <span>Category</span>
              <select name="newCategory" [(ngModel)]="newCategory" [disabled]="isSaving">
                <option *ngFor="let cat of categoryOptions(cfg)" [value]="cat">{{ cat }}</option>
              </select>
            </label>
            <label style="flex: 1;">
              <span>Scope / Cohort Tag (optional)</span>
              <input
                type="text"
                name="newScopeTag"
                [(ngModel)]="newScopeTag"
                placeholder="e.g. room-sunflower or general"
                [disabled]="isSaving"
              />
            </label>
          </div>
          <label>
            <span>Notes / Details (optional)</span>
            <input
              type="text"
              name="newNotes"
              [(ngModel)]="newNotes"
              placeholder="Details persisted in MongoDB under your opaque ps_... handle"
              [disabled]="isSaving"
            />
          </label>
          <div class="actions-row" style="margin-top: 4px;">
            <button type="submit" [disabled]="!newTitle.trim() || isSaving">
              {{ isSaving ? 'Saving to MongoDB…' : 'Publish as ' + (activeRoleLabel || 'Member') }}
            </button>
          </div>
        </form>

        <p class="error-banner" *ngIf="errorMsg">{{ errorMsg }}</p>

        <div
          *ngIf="records.length === 0 && !isLoading"
          class="permset-entry"
          style="text-align: center; padding: 22px;"
        >
          <strong>No records stored for your PermSet handle yet</strong>
          <p class="permset-explain" style="max-width: 520px; margin: 6px auto 14px;">
            Add a record using the form above or click <strong>+ Seed Sample Record</strong> to test
            the full Angular &rarr; Nginx &rarr; Express &rarr; MongoDB pipeline right now.
          </p>
          <button
            type="button"
            class="secondary btn-sm"
            (click)="seedSampleRecord(cfg)"
            [disabled]="isSaving"
          >
            Seed Sample Starter Record
          </button>
        </div>

        <div *ngFor="let rec of records" class="permset-entry" style="margin-bottom: 10px;">
          <div class="permset-name">
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <strong style="font-size: 15px; color: var(--text);">{{ rec.title }}</strong>
              <span class="tag tag-private">{{ rec.roleLabel || rec.category }}</span>
              <span class="tag tag-public" *ngIf="rec.scopeTag">
                Scope: {{ rec.scopeTag }}
              </span>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <span class="muted" style="font-size: 12px;">
                {{ rec.createdAt | date: 'medium' }}
              </span>
              <button
                type="button"
                class="secondary btn-sm"
                (click)="deleteRecord(rec._id!)"
              >
                Delete
              </button>
            </div>
          </div>
          <p class="permset-explain" *ngIf="rec.notes">{{ rec.notes }}</p>
          <p class="permset-explain" style="font-size: 11.5px; margin-top: 6px;">
            Author PermSet: <code>{{ rec.permset }}</code> · Category: <code>{{ rec.category }}</code>
          </p>
        </div>
      </section>

      <!-- 3. Getting Started: How to Customize This MEAN App -->
      <section class="card">
        <div class="section-header">
          <div>
            <div class="eyebrow">Developer Blueprint &amp; Customization Guide</div>
            <h2>How to Modify &amp; Extend {{ cfg.appName }}</h2>
          </div>
          <span class="badge badge-ok">Zero Secrets in Repo</span>
        </div>

        <p class="muted" style="margin-top: 0;">
          This application was automatically provisioned by
          <a href="https://bookins.io" target="_blank" rel="noopener">bookins.io</a>. You can
          export or sync its standalone public GitHub repository at any time from your
          <strong>Bookins.io Organization Dashboard</strong> and customize both the Angular frontend
          and Express/MongoDB backend using any AI-enabled IDE.
        </p>

        <div class="workflow-grid" style="margin-top: 20px;">
          <div class="workflow-step">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="step-badge">1. Clone &amp; Run Locally</span>
              <button
                type="button"
                class="secondary btn-sm"
                (click)="copyText(localCloneCommands(cfg), 'clone')"
              >
                {{ copiedKey === 'clone' ? 'Copied!' : 'Copy' }}
              </button>
            </div>
            <pre>{{ localCloneCommands(cfg) }}</pre>
          </div>

          <div class="workflow-step">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <span class="step-badge">2. Push &amp; Roll Out to K3s</span>
              <button
                type="button"
                class="secondary btn-sm"
                (click)="copyText(deployCommands(cfg), 'deploy')"
              >
                {{ copiedKey === 'deploy' ? 'Copied!' : 'Copy' }}
              </button>
            </div>
            <pre>{{ deployCommands(cfg) }}</pre>
            <p style="margin-top: 10px; font-size: 12.5px;">
              Pushing to <code>main</code> triggers GitHub Actions to build
              <code>ghcr.io/grokism/{{ derivedSlug(cfg) }}-fe:latest</code>. Then click
              <strong>Deploy Latest from GitHub</strong> in Bookins.io to roll it out to K3s.
            </p>
          </div>
        </div>
      </section>
    </div>
  `,
})
export class HomeComponent implements OnInit {
  dbConnected = false;
  dbName = '';
  proxyRoute = '';
  activePermset = '';
  activeRoleKey = 'member';
  activeRoleLabel = 'Member';
  activeScopeTag = '';
  memberRole: 'admin' | 'member' = 'member';
  records: MemberRecord[] = [];
  newTitle = '';
  newCategory = 'General';
  newScopeTag = '';
  newNotes = '';
  isLoading = false;
  isSaving = false;
  errorMsg = '';
  copiedKey: string | null = null;

  constructor(
    public auth: AuthService,
    public permsets: PermsetService,
    public orgConfig: OrgConfigService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.permsets.access$.pipe(take(1)).subscribe((state) => {
      if (state.activeRoleKey) this.activeRoleKey = state.activeRoleKey;
      if (state.activeRoleLabel) this.activeRoleLabel = state.activeRoleLabel;
      if (state.activeScopeTag) {
        this.activeScopeTag = state.activeScopeTag;
        this.newScopeTag = state.activeScopeTag;
      }
    });
    this.orgConfig.config$.pipe(take(2)).subscribe((cfg) => {
      const opts = this.categoryOptions(cfg);
      if (opts.length > 0 && (!this.newCategory || this.newCategory === 'General')) {
        this.newCategory = opts[0];
      }
    });
    this.checkHealth();
    this.loadRecords();
  }

  categoryOptions(cfg: OrgRuntimeConfig): string[] {
    const a = cfg.appBlueprint?.templateAnswers || {};
    const raw =
      a['deliverableCategories'] ||
      a['updateCategories'] ||
      a['productCategories'] ||
      a['sessionCategories'] ||
      a['governanceCategories'] ||
      a['postCategories'] ||
      '';
    const parsed = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return parsed.length > 0
      ? parsed
      : ['General', 'Milestone', 'Task', 'Announcement', 'Architecture'];
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

  localCloneCommands(cfg: OrgRuntimeConfig): string {
    const slug = this.derivedSlug(cfg);
    const db = this.derivedDbName(cfg);
    return `git clone https://github.com/Grokism/${slug}.git\ncd ${slug}\nnpm install\nnpm run build\nPORT=3000 MONGO_URI="mongodb://127.0.0.1:27017/${db}" npm run server`;
  }

  deployCommands(cfg: OrgRuntimeConfig): string {
    return `git add .\ngit commit -m "Customize ${cfg.appName} MEAN stack app"\ngit push origin main`;
  }

  copyText(text: string, key: string): void {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => {
        this.copiedKey = key;
        setTimeout(() => {
          if (this.copiedKey === key) {
            this.copiedKey = null;
          }
        }, 2000);
      });
    }
  }

  private async authHeaders(): Promise<HttpHeaders> {
    const claims = await firstValueFrom(
      this.auth.idTokenClaims$.pipe(
        filter((c) => !!c?.__raw),
        take(1)
      )
    );
    return new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${claims!.__raw}`,
    });
  }

  checkHealth(): void {
    this.http.get<HealthResponse>('/api/health').subscribe({
      next: (res) => {
        this.dbConnected = res.mongoConnected;
        this.dbName = res.dbName;
        this.proxyRoute = res.proxy || 'nginx:80 -> express:3000';
      },
      error: () => {
        this.dbConnected = false;
      },
    });
  }

  async loadRecords(): Promise<void> {
    this.isLoading = true;
    this.errorMsg = '';
    try {
      const headers = await this.authHeaders();
      const res = await firstValueFrom(
        this.http.get<{
          dbName: string;
          permset: string;
          role?: 'admin' | 'member';
          roleKey?: string;
          roleLabel?: string;
          scopeTag?: string;
          records: MemberRecord[];
        }>('/api/records', {
          headers,
        })
      );
      this.dbConnected = true;
      this.dbName = res.dbName || this.dbName;
      this.activePermset = res.permset || '';
      this.memberRole = res.role || 'member';
      if (res.roleKey) this.activeRoleKey = res.roleKey;
      if (res.roleLabel) this.activeRoleLabel = res.roleLabel;
      if (res.scopeTag) {
        this.activeScopeTag = res.scopeTag;
        if (!this.newScopeTag) this.newScopeTag = res.scopeTag;
      }
      this.records = res.records || [];
    } catch (err: any) {
      this.errorMsg = err?.error?.error || 'Could not load records from MongoDB.';
    } finally {
      this.isLoading = false;
    }
  }

  async createRecord(): Promise<void> {
    if (!this.newTitle.trim() || this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';
    try {
      const headers = await this.authHeaders();
      await firstValueFrom(
        this.http.post(
          '/api/records',
          {
            title: this.newTitle.trim(),
            category: this.newCategory.trim() || 'General',
            scopeTag: this.newScopeTag.trim() || this.activeScopeTag || undefined,
            notes: this.newNotes.trim(),
          },
          { headers }
        )
      );
      this.newTitle = '';
      this.newNotes = '';
      await this.loadRecords();
    } catch (err: any) {
      this.errorMsg = err?.error?.error || 'Could not save record to MongoDB.';
    } finally {
      this.isSaving = false;
    }
  }

  async seedSampleRecord(cfg: OrgRuntimeConfig): Promise<void> {
    if (this.isSaving) return;
    this.isSaving = true;
    this.errorMsg = '';
    try {
      const headers = await this.authHeaders();
      await firstValueFrom(
        this.http.post(
          '/api/records',
          {
            title: `Welcome to ${cfg.appName} (${this.activeRoleLabel || 'Member'})`,
            category: this.newCategory || 'General',
            scopeTag: this.activeScopeTag || 'general',
            notes: `Verified end-to-end: Angular SPA -> Nginx (:80) -> Express (127.0.0.1:3000) -> Isolated MongoDB (${
              this.dbName || this.derivedDbName(cfg)
            }).`,
          },
          { headers }
        )
      );
      await this.loadRecords();
    } catch (err: any) {
      this.errorMsg = err?.error?.error || 'Could not seed sample record.';
    } finally {
      this.isSaving = false;
    }
  }

  async deleteRecord(id: string): Promise<void> {
    if (!id) return;
    try {
      const headers = await this.authHeaders();
      await firstValueFrom(this.http.delete(`/api/records/${id}`, { headers }));
      this.records = this.records.filter((r) => r._id !== id);
    } catch (err: any) {
      this.errorMsg = err?.error?.error || 'Could not delete record.';
    }
  }
}
