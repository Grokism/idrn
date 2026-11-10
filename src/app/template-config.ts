/**
 * Bookins.io PaaS Template Configuration (`src/app/template-config.ts`)
 *
 * When a developer clones a Bookins Starter Template repository into Cursor or any IDE,
 * they can freely customize `landing.component.ts`, `home.component.ts`, add new Angular
 * routes/components, and add Express `/api/*` endpoints in `server.mjs`.
 *
 * When an Organization User clicks "Use Template" in Bookins.io and provisions their app,
 * Bookins.io pulls the developer's GitHub template repository READ-ONLY, preserves the
 * developer's custom Angular components and Express routes, and writes the OrgUser's
 * wizard answers, PermSet roles, and uploaded brand assets into this file before pushing
 * to the OrgUser's newly scaffolded standalone GitHub repository.
 */

export interface TemplateRoleConfig {
  roleKey: string;
  roleLabel: string;
  purpose: string;
  enrollmentPolicy: 'issuer_only' | 'self_enroll';
  scopeLabel?: string;
  capabilities?: string[];
}

export interface TemplateUploadedAssetConfig {
  fileName: string;
  assetPath: string;
  publicUrl?: string;
  slot: 'logo' | 'hero' | 'gallery' | 'feature';
  altText?: string;
  mimeType?: string;
}

export interface BookinsTemplateAppConfig {
  appName: string;
  orgName: string;
  appSlug: string;
  origin: string;
  description: string;
  archetype: string;
  archetypeLabel: string;
  templateId: string;
  themePalette: string;
  headline: string;
  subheadline: string;
  primaryGoal: string;
  keyFeatures: string[];
  templateAnswers: Record<string, string>;
  permsetRoles: TemplateRoleConfig[];
  uploadedAssets: TemplateUploadedAssetConfig[];
  sourceTemplateRepoUrl?: string;
  sourceTemplateBranch?: string;
  sourceTemplateCommitSha?: string;
  preserveDeveloperPages?: boolean;
}

export const TEMPLATE_CONFIG: BookinsTemplateAppConfig = {
  appName: 'IDRN',
  orgName: 'IDRN',
  appSlug: 'idrn',
  origin: 'https://idrn.net',
  description: 'IDRN (IDRN)',
  archetype: 'default',
  archetypeLabel: 'PermSet MEAN Stack Application',
  templateId: 'default',
  themePalette: 'midnight_slate',
  headline: 'Welcome to IDRN',
  subheadline: 'IDRN (IDRN)',
  primaryGoal:
    'Provide a sybil-resistant, zero-PII member workspace backed by an isolated K3s MongoDB database and Nginx reverse proxy.',
  keyFeatures: [
    'Public landing page with PermSet Member Login and /join self-enrollment',
    'Protected /home member workspace with isolated MongoDB CRUD (/api/records)',
    'Top-right Disclosed Credentials dropdown showing public amihuman + private origin PermSet',
  ],
  templateAnswers: {
    primaryCtaText:
      'Access your workspace with 100% zero-PII sybil-resistant PermSet credentials.',
  },
  permsetRoles: [],
  uploadedAssets: [],
  preserveDeveloperPages: true,
};
