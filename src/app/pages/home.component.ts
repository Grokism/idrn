import { Component, OnInit } from '@angular/core';
import { CommonModule, AsyncPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { PermsetService } from '../permset.service';
import { OrgConfigService } from '../org-config.service';

export interface MemberRecord {
  _id?: string;
  permset: string;
  origin: string;
  title: string;
  category: string;
  notes: string;
  createdAt: string;
}

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, FormsModule, AsyncPipe, DatePipe],
  template: `
    <div *ngIf="orgConfig.config$ | async as cfg">
      <div class="card">
        <div class="eyebrow">Origin-Verified Member Session · {{ cfg.origin }}</div>
        <h2>{{ cfg.appName }} — Protected Member Workspace</h2>
        <p class="muted" *ngIf="auth.user$ | async as user">
          Authenticated Handle: <strong>&#64;{{ user.nickname || user.name || user.sub }}</strong>
          &mdash; click your handle in the top-right header at any time to inspect your disclosed
          credentials.
        </p>

        <ng-container *ngIf="permsets.access$ | async as evalState">
          <h3>Private — Disclosed Only to This App ({{ evalState.origin }})</h3>
          <p class="muted" *ngIf="evalState.originPrivatePermsets.length === 0">
            No private permsets disclosed for this origin.
          </p>
          <ul>
            <li *ngFor="let p of evalState.originPrivatePermsets">
              <code>{{ p.permset }}</code>
              <span class="tag tag-private" style="margin-left:8px">
                {{ cfg.orgName | lowercase }} · private
              </span>
              <span class="muted" *ngIf="p.description"> &mdash; {{ p.description }}</span>
            </li>
          </ul>

          <h3>Public — Visible Across the Grokism Ecosystem</h3>
          <p class="muted" *ngIf="evalState.publicPermsets.length === 0">None.</p>
          <ul>
            <li *ngFor="let p of evalState.publicPermsets">
              <code>{{ p.permset }}</code>
              <span class="tag tag-public" style="margin-left:8px">amihuman · human verified</span>
              <span class="muted" *ngIf="p.description"> &mdash; {{ p.description }}</span>
            </li>
          </ul>
        </ng-container>
      </div>

      <!-- Isolated Tenant MongoDB Workspace (/api/records on server.mjs -> mongodb-0) -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
          <div>
            <div class="eyebrow">Isolated Tenant MongoDB · Zero-PII Storage</div>
            <h3 style="margin:0;">{{ cfg.appName }} Member Records</h3>
          </div>
          <span class="badge" [class.badge-ok]="dbConnected" [class.badge-warn]="!dbConnected">
            {{ dbConnected ? 'MongoDB Connected · ' + dbName : 'Checking MongoDB…' }}
          </span>
        </div>

        <p class="muted" style="font-size:14px;margin-top:8px;">
          Records created below are stored in this application's isolated MongoDB database
          (<code>{{ dbName || 'paas_db' }}</code> on the local K3s <code>mongodb-0</code> server) and
          keyed strictly by your opaque private PermSet handle
          <code *ngIf="activePermset">{{ activePermset }}</code> &mdash; never by your name or email.
        </p>

        <form class="join-form" (ngSubmit)="createRecord()" style="margin-bottom:20px;">
          <div class="form-row">
            <label style="flex:2;">
              <span>Record Title *</span>
              <input
                type="text"
                name="newTitle"
                [(ngModel)]="newTitle"
                placeholder="e.g. Project milestone or member note"
                required
                [disabled]="isSaving"
              />
            </label>
            <label style="flex:1;">
              <span>Category</span>
              <input
                type="text"
                name="newCategory"
                [(ngModel)]="newCategory"
                placeholder="General"
                [disabled]="isSaving"
              />
            </label>
          </div>
          <label>
            <span>Notes (optional)</span>
            <input
              type="text"
              name="newNotes"
              [(ngModel)]="newNotes"
              placeholder="Additional details stored under your opaque PermSet handle"
              [disabled]="isSaving"
            />
          </label>
          <div class="actions-row" style="margin-top:6px;">
            <button type="submit" [disabled]="!newTitle.trim() || isSaving">
              {{ isSaving ? 'Saving to MongoDB…' : 'Save Record to MongoDB' }}
            </button>
            <button type="button" class="secondary" (click)="loadRecords()" [disabled]="isLoading">
              {{ isLoading ? 'Loading…' : 'Refresh Records' }}
            </button>
          </div>
        </form>

        <p class="error-banner" *ngIf="errorMsg">{{ errorMsg }}</p>

        <div *ngIf="records.length === 0 && !isLoading" class="muted" style="padding:10px 0;">
          No records stored for your PermSet handle yet. Add one above to test your isolated MongoDB
          database.
        </div>

        <div *ngFor="let rec of records" class="permset-entry" style="margin-bottom:10px;">
          <div class="permset-name">
            <div>
              <strong>{{ rec.title }}</strong>
              <span class="tag tag-private" style="margin-left:8px;">{{ rec.category }}</span>
            </div>
            <div style="display:flex;align-items:center;gap:10px;">
              <span class="muted" style="font-size:12px;">
                {{ rec.createdAt | date:'medium' }}
              </span>
              <button
                type="button"
                class="secondary"
                style="padding:4px 10px;font-size:12px;"
                (click)="deleteRecord(rec._id!)"
              >
                Delete
              </button>
            </div>
          </div>
          <p class="permset-explain" *ngIf="rec.notes">{{ rec.notes }}</p>
          <p class="permset-explain" style="font-size:11px;margin-top:4px;">
            Owner PermSet: <code>{{ rec.permset }}</code>
          </p>
        </div>
      </div>
    </div>
  `,
})
export class HomeComponent implements OnInit {
  dbConnected = false;
  dbName = '';
  activePermset = '';
  records: MemberRecord[] = [];
  newTitle = '';
  newCategory = 'General';
  newNotes = '';
  isLoading = false;
  isSaving = false;
  errorMsg = '';

  constructor(
    public auth: AuthService,
    public permsets: PermsetService,
    public orgConfig: OrgConfigService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.checkHealth();
    this.loadRecords();
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
    this.http.get<{ status: string; mongoConnected: boolean; dbName: string }>('/api/health').subscribe({
      next: (res) => {
        this.dbConnected = res.mongoConnected;
        this.dbName = res.dbName;
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
        this.http.get<{ dbName: string; permset: string; records: MemberRecord[] }>('/api/records', {
          headers,
        })
      );
      this.dbConnected = true;
      this.dbName = res.dbName || this.dbName;
      this.activePermset = res.permset || '';
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
