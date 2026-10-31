import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideAuth0 } from '@auth0/auth0-angular';
import { routes } from './app.routes';
import { environment } from '../environments/environment';

const redirectOrigin =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : environment.auth0.appUrl;

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(),
    provideAuth0({
      domain: environment.auth0.domain,
      clientId: environment.auth0.clientId,
      // Like grokism.io, do not force an API audience on authorize so the shared
      // SPA client always displays Universal Login without requiring per-API grants.
      // The post-login Action stamps permsets onto the ID token, which bookins.io
      // verifies on /api/self-service/paas/*.
      authorizationParams: {
        redirect_uri: redirectOrigin,
      },
      cacheLocation: 'localstorage',
    }),
  ],
};
