// Public, non-secret configuration. A browser SPA is a public OAuth client (PKCE,
// no client secret), so every value here is safe to commit and ship to browsers.
// Filled in by the bookins PaaS provisioner at scaffold time, with runtime fallbacks
// so a single multi-tenant container can also serve any *.apps.bookins.io or custom CNAME origin.

function resolvePlaceholder(val: string, fallback: string): string {
  return !val || val.startsWith('__') ? fallback : val;
}

const runtimeOrigin =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : resolvePlaceholder('https://idrn.bookins.io', 'https://localhost:4200');

export const environment = {
  production: true,
  appName: resolvePlaceholder('idrn_client', 'Bookins PermSet App'),
  appDescription: resolvePlaceholder(
    'the idrn client portal',
    'Zero-PII identity and origin-scoped authorization powered by bookins.io'
  ),
  bookinsApiBase: 'https://bookins.io',
  auth0: {
    domain: resolvePlaceholder('login.bookins.io', 'login.bookins.io'),
    clientId: resolvePlaceholder('Br7Z8Hc0Kh3GDY9cC6SOmmkWddELlbo3', 'Br7Z8Hc0Kh3GDY9cC6SOmmkWddELlbo3'),
    audience: resolvePlaceholder('https://bookins.io', 'https://bookins.io'),
    appUrl: runtimeOrigin,
  },
  // Namespace of the Auth0 custom claim the post-login Action injects the permsets under.
  permsetNamespace: resolvePlaceholder('https://grokism.io/permsets', 'https://grokism.io/permsets'),
};
