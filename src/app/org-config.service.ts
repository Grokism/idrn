import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../environments/environment';

export interface OrgRuntimeConfig {
  appName: string;
  orgName: string;
  description: string;
  origin: string;
  domainMode: 'subdomain' | 'custom';
  tlsStatus: string;
  auth0: {
    domain: string;
    clientId: string;
    audience: string;
    appUrl: string;
  };
  permsetNamespace: string;
}

@Injectable({ providedIn: 'root' })
export class OrgConfigService {
  private readonly configSubject: BehaviorSubject<OrgRuntimeConfig>;
  public readonly config$: Observable<OrgRuntimeConfig>;

  constructor(private http: HttpClient) {
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : environment.auth0.appUrl;

    const initialConfig: OrgRuntimeConfig = {
      appName: this.deriveDefaultAppName(origin),
      orgName: this.deriveDefaultAppName(origin),
      description: environment.appDescription,
      origin,
      domainMode: origin.endsWith('.apps.bookins.io') ? 'subdomain' : 'custom',
      tlsStatus: 'active_wildcard',
      auth0: {
        domain: environment.auth0.domain,
        clientId: environment.auth0.clientId,
        audience: environment.auth0.audience,
        appUrl: origin,
      },
      permsetNamespace: environment.permsetNamespace,
    };

    this.configSubject = new BehaviorSubject<OrgRuntimeConfig>(initialConfig);
    this.config$ = this.configSubject.asObservable();
  }

  private deriveDefaultAppName(origin: string): string {
    if (environment.appName && environment.appName !== 'Bookins PermSet App') {
      return environment.appName;
    }
    try {
      const host = new URL(origin).hostname;
      const slug = host.split('.')[0] || 'App';
      return slug.charAt(0).toUpperCase() + slug.slice(1);
    } catch {
      return 'Bookins PermSet App';
    }
  }

  loadRuntimeConfig(): Observable<OrgRuntimeConfig> {
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : environment.auth0.appUrl;

    return this.http
      .get<OrgRuntimeConfig>(
        `${environment.bookinsApiBase}/api/paas/org-config?origin=${encodeURIComponent(origin)}`
      )
      .pipe(
        tap((cfg) => {
          if (cfg && cfg.appName) {
            this.configSubject.next(cfg);
            if (typeof document !== 'undefined') {
              document.title = cfg.appName;
            }
          }
        }),
        catchError(() => of(this.configSubject.value))
      );
  }
}
