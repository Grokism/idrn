import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { environment } from '../environments/environment';
import { TEMPLATE_CONFIG } from './template-config';

export interface PaasRoleSpec {
  roleKey: string;
  roleLabel: string;
  purpose: string;
  enrollmentPolicy: 'issuer_only' | 'self_enroll';
  scopeLabel?: string;
  capabilities?: string[];
}

export interface PaasUploadedAssetSpec {
  fileName: string;
  assetPath: string;
  publicUrl?: string;
  slot: 'logo' | 'hero' | 'gallery' | 'feature';
  altText?: string;
  mimeType?: string;
}

export interface PaasAppBlueprint {
  archetype: string;
  archetypeLabel?: string;
  templateId?: string;
  themePalette?: string;
  headline?: string;
  subheadline?: string;
  primaryGoal?: string;
  keyFeatures?: string[];
  templateAnswers?: Record<string, string>;
  customPrompt?: string;
  assembledPrompt?: string;
  aiSynthesized?: boolean;
  aiModel?: string;
  uploadedAssets?: PaasUploadedAssetSpec[];
}

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
  permsetRoles?: PaasRoleSpec[];
  archetype?: string;
  themePalette?: string;
  appBlueprint?: PaasAppBlueprint | null;
}

const RUNTIME_THEME_PALETTES: Record<
  string,
  {
    bg: string;
    bgElevated: string;
    card: string;
    accent: string;
    accentStrong: string;
    text: string;
    muted: string;
  }
> = {
  ocean_teal: {
    bg: '#f4fbf9',
    bgElevated: '#e6f6f2',
    card: '#ffffff',
    accent: '#0d9488',
    accentStrong: '#0f766e',
    text: '#0f172a',
    muted: '#475569',
  },
  daycare_sunrise: {
    bg: '#fffdf6',
    bgElevated: '#fef3c7',
    card: '#ffffff',
    accent: '#d97706',
    accentStrong: '#b45309',
    text: '#1e1b4b',
    muted: '#4b5563',
  },
  emerald_commerce: {
    bg: '#f5fbf7',
    bgElevated: '#dcfce7',
    card: '#ffffff',
    accent: '#059669',
    accentStrong: '#047857',
    text: '#062c1e',
    muted: '#374151',
  },
  clinical_blue: {
    bg: '#f3f9fd',
    bgElevated: '#e0f2fe',
    card: '#ffffff',
    accent: '#0284c7',
    accentStrong: '#0369a1',
    text: '#0c2340',
    muted: '#475569',
  },
  civic_gold: {
    bg: '#fbfaf3',
    bgElevated: '#fef9c3',
    card: '#ffffff',
    accent: '#15803d',
    accentStrong: '#166534',
    text: '#1c1917',
    muted: '#44403c',
  },
  midnight_slate: {
    bg: '#faf7ff',
    bgElevated: '#f3e8ff',
    card: '#ffffff',
    accent: '#7c3aed',
    accentStrong: '#6d28d9',
    text: '#1e1b4b',
    muted: '#475569',
  },
};

@Injectable({ providedIn: 'root' })
export class OrgConfigService {
  private readonly configSubject: BehaviorSubject<OrgRuntimeConfig>;
  public readonly config$: Observable<OrgRuntimeConfig>;

  constructor(private http: HttpClient) {
    const origin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : environment.auth0.appUrl;

    const templateRoles: PaasRoleSpec[] = Array.isArray(TEMPLATE_CONFIG.permsetRoles)
      ? TEMPLATE_CONFIG.permsetRoles
      : [];
    const templateTheme = TEMPLATE_CONFIG.themePalette || 'midnight_slate';
    const hasTemplateBlueprint =
      Boolean(TEMPLATE_CONFIG.templateId && TEMPLATE_CONFIG.templateId !== 'default') ||
      Object.keys(TEMPLATE_CONFIG.templateAnswers || {}).length > 0 ||
      templateRoles.length > 0;

    const initialConfig: OrgRuntimeConfig = {
      appName: this.deriveDefaultAppName(origin),
      orgName:
        TEMPLATE_CONFIG.orgName && !TEMPLATE_CONFIG.orgName.startsWith('__')
          ? TEMPLATE_CONFIG.orgName
          : this.deriveDefaultAppName(origin),
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
      permsetRoles: templateRoles,
      archetype: TEMPLATE_CONFIG.archetype || 'default',
      themePalette: templateTheme,
      appBlueprint: hasTemplateBlueprint
        ? {
            archetype: TEMPLATE_CONFIG.archetype || 'default',
            archetypeLabel: TEMPLATE_CONFIG.archetypeLabel,
            templateId: TEMPLATE_CONFIG.templateId || 'default',
            themePalette: templateTheme,
            headline:
              TEMPLATE_CONFIG.headline && !TEMPLATE_CONFIG.headline.includes('IDRN')
                ? TEMPLATE_CONFIG.headline
                : undefined,
            subheadline:
              TEMPLATE_CONFIG.subheadline && !TEMPLATE_CONFIG.subheadline.startsWith('__')
                ? TEMPLATE_CONFIG.subheadline
                : undefined,
            primaryGoal: TEMPLATE_CONFIG.primaryGoal,
            keyFeatures: TEMPLATE_CONFIG.keyFeatures,
            templateAnswers: TEMPLATE_CONFIG.templateAnswers,
            uploadedAssets: TEMPLATE_CONFIG.uploadedAssets,
          }
        : null,
    };

    this.configSubject = new BehaviorSubject<OrgRuntimeConfig>(initialConfig);
    this.config$ = this.configSubject.asObservable();
    this.applyRuntimeTheme(templateTheme);
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

  private applyRuntimeTheme(paletteKey?: string): void {
    if (typeof document === 'undefined' || !paletteKey) return;
    const theme = RUNTIME_THEME_PALETTES[paletteKey];
    if (!theme) return;
    const root = document.documentElement.style;
    root.setProperty('--bg', theme.bg);
    root.setProperty('--bg-elevated', theme.bgElevated);
    root.setProperty('--card', theme.card);
    root.setProperty('--accent', theme.accent);
    root.setProperty('--accent-strong', theme.accentStrong);
    root.setProperty('--text', theme.text);
    root.setProperty('--muted', theme.muted);
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
            this.applyRuntimeTheme(cfg.themePalette || cfg.appBlueprint?.themePalette);
          }
        }),
        catchError(() => of(this.configSubject.value))
      );
  }
}
