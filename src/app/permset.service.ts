import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '@auth0/auth0-angular';
import { BehaviorSubject, Observable, combineLatest, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { environment } from '../environments/environment';

export interface Permset {
  _id?: string;
  permset: string;
  description?: string;
  url?: string;
  private?: boolean;
  status?: string;
  roleKey?: string;
  roleLabel?: string;
  scopeTag?: string;
}

export interface PermsetsResponse {
  publicPermsets: Permset[];
  privatePermsets: Permset[];
}

export interface PermsetEvaluationState {
  origin: string;
  accountType: string;
  isHuman: boolean;
  hasOriginPermset: boolean;
  isAuthorized: boolean;
  activeRoleKey: string;
  activeRoleLabel: string;
  activeScopeTag: string;
  publicPermsets: Permset[];
  originPrivatePermsets: Permset[];
  allPrivatePermsets: Permset[];
}

function normalizeOrigin(urlOrOrigin: string | undefined): string {
  if (!urlOrOrigin) return '';
  try {
    return new URL(urlOrOrigin).origin.toLowerCase();
  } catch {
    return urlOrOrigin.replace(/\/+$/, '').toLowerCase();
  }
}

function deriveRoleAndScope(perm: Permset | undefined): {
  roleKey: string;
  roleLabel: string;
  scopeTag: string;
} {
  if (!perm) {
    return { roleKey: 'member', roleLabel: 'Member', scopeTag: '' };
  }
  const desc = String(perm.description || '');
  const bracketMatch = desc.match(/\[([^\]]+)\]/);
  const scopeTag = (perm.scopeTag || (bracketMatch ? bracketMatch[1] : '') || '').trim();

  if (perm.roleKey || perm.roleLabel) {
    const roleKey = (perm.roleKey || perm.roleLabel || 'member')
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_');
    const roleLabel = perm.roleLabel || perm.roleKey || 'Member';
    return { roleKey, roleLabel, scopeTag };
  }

  const cleanDesc = desc.replace(/\[[^\]]+\]/g, '').trim();
  if (cleanDesc.toLowerCase().includes('admin')) {
    return { roleKey: 'admin', roleLabel: 'Admin', scopeTag };
  }
  return { roleKey: 'member', roleLabel: cleanDesc || 'Member', scopeTag };
}

/**
 * Evaluates both:
 * 1) Public Amihuman humanity (`amihuman verified human`), and
 * 2) Origin-scoped private organization permsets (`permset.url === window.location.origin`),
 *    including dynamic PaaS role (`roleKey`, `roleLabel`) and cohort/scope tag (`scopeTag`).
 */
@Injectable({ providedIn: 'root' })
export class PermsetService {
  private readonly bookinsBase = (environment.bookinsApiBase || 'https://bookins.io').replace(
    /\/+$/,
    ''
  );
  private readonly refreshTrigger$ = new BehaviorSubject<number>(0);

  public readonly access$: Observable<PermsetEvaluationState>;

  constructor(private auth: AuthService, private http: HttpClient) {
    const targetOrigin =
      typeof window !== 'undefined' ? window.location.origin : environment.auth0.appUrl;
    const normalizedTarget = normalizeOrigin(targetOrigin);

    this.access$ = combineLatest([this.auth.idTokenClaims$, this.refreshTrigger$]).pipe(
      switchMap(([claims]) => {
        if (!claims) {
          return of({
            origin: normalizedTarget,
            accountType: 'user',
            isHuman: false,
            hasOriginPermset: false,
            isAuthorized: false,
            activeRoleKey: 'member',
            activeRoleLabel: 'Member',
            activeScopeTag: '',
            publicPermsets: [],
            originPrivatePermsets: [],
            allPrivatePermsets: [],
          });
        }

        const rawClaim = claims?.[environment.permsetNamespace];
        const tokenPermsets: PermsetsResponse =
          rawClaim && typeof rawClaim === 'object'
            ? (rawClaim as PermsetsResponse)
            : { publicPermsets: [], privatePermsets: [] };

        const accountType = String(claims?.['https://grokism.io/account_type'] || 'user');
        const rawJwt = claims?.__raw;

        const dappFetch$: Observable<PermsetsResponse> = rawJwt
          ? this.http
              .get<PermsetsResponse>(
                `${this.bookinsBase}/api/dapp/permsets?url=${encodeURIComponent(normalizedTarget)}`,
                {
                  headers: new HttpHeaders({ Authorization: `Bearer ${rawJwt}` }),
                }
              )
              .pipe(catchError(() => of({ publicPermsets: [], privatePermsets: [] })))
          : of({ publicPermsets: [], privatePermsets: [] });

        return dappFetch$.pipe(
          map((dappPermsets) => {
            const mergedPublic = this.dedupePermsets([
              ...(tokenPermsets.publicPermsets || []),
              ...(dappPermsets.publicPermsets || []),
            ]);
            const mergedPrivate = this.dedupePermsets([
              ...(tokenPermsets.privatePermsets || []),
              ...(dappPermsets.privatePermsets || []),
            ]);

            const combined: PermsetsResponse = {
              publicPermsets: mergedPublic,
              privatePermsets: mergedPrivate,
            };

            const isHuman = this.hasAmihumanHumanity(combined);
            const originPrivatePermsets = this.getOriginPrivatePermsets(
              combined,
              normalizedTarget
            );
            const hasOriginPermset = originPrivatePermsets.length > 0;
            const roleInfo = deriveRoleAndScope(originPrivatePermsets[0]);

            return {
              origin: normalizedTarget,
              accountType,
              isHuman,
              hasOriginPermset,
              isAuthorized: isHuman && hasOriginPermset,
              activeRoleKey: roleInfo.roleKey,
              activeRoleLabel: roleInfo.roleLabel,
              activeScopeTag: roleInfo.scopeTag,
              publicPermsets: mergedPublic,
              originPrivatePermsets,
              allPrivatePermsets: mergedPrivate,
            };
          })
        );
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }

  /** Re-fetches live permsets from Bookins.io (e.g. immediately after "Become a Member" enrollment). */
  refresh(): void {
    this.refreshTrigger$.next(this.refreshTrigger$.value + 1);
  }

  private dedupePermsets(list: Permset[]): Permset[] {
    const mapByHandle = new Map<string, Permset>();
    for (const item of list) {
      if (item && item.permset) {
        const existing = mapByHandle.get(item.permset);
        mapByHandle.set(item.permset, existing ? { ...existing, ...item } : item);
      }
    }
    return Array.from(mapByHandle.values());
  }

  getPermsets(): Observable<PermsetsResponse> {
    return this.access$.pipe(
      map((state) => ({
        publicPermsets: state.publicPermsets,
        privatePermsets: state.originPrivatePermsets,
      }))
    );
  }

  hasAmihumanHumanity(permsets: PermsetsResponse): boolean {
    const pub = permsets?.publicPermsets || [];
    return pub.some(
      (p) =>
        p.private === false &&
        p.status !== 'revoked' &&
        (String(p.description || '')
          .toLowerCase()
          .includes('amihuman') ||
          String(p.url || '')
            .toLowerCase()
            .includes('amihuman.org'))
    );
  }

  getOriginPrivatePermsets(
    permsets: PermsetsResponse,
    targetOrigin: string = typeof window !== 'undefined' ? window.location.origin : environment.auth0.appUrl
  ): Permset[] {
    const normalizedTarget = normalizeOrigin(targetOrigin);
    const priv = permsets?.privatePermsets || [];
    return priv.filter(
      (p) =>
        p.private !== false &&
        p.status !== 'revoked' &&
        p.description !== 'default permset' &&
        normalizeOrigin(p.url) === normalizedTarget
    );
  }

  evaluateAccess(_targetOrigin?: string): Observable<PermsetEvaluationState> {
    return this.access$;
  }
}
