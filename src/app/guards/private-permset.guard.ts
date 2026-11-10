import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '@auth0/auth0-angular';
import { of } from 'rxjs';
import { filter, map, switchMap, take } from 'rxjs/operators';
import { PermsetService } from '../permset.service';

export const privatePermsetGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const permsets = inject(PermsetService);
  const router = inject(Router);

  return auth.isLoading$.pipe(
    filter((loading) => !loading),
    take(1),
    switchMap(() => auth.isAuthenticated$.pipe(take(1))),
    switchMap((isAuthenticated) => {
      if (!isAuthenticated) {
        auth
          .loginWithRedirect({
            appState: { target: state.url },
            authorizationParams: {
              redirect_uri: window.location.origin,
            },
          })
          .subscribe();
        return of(false);
      }

      return permsets.access$.pipe(
        take(1),
        map((evalState) => {
          if (evalState.isHuman && evalState.hasOriginPermset) {
            return true;
          }
          return router.createUrlTree(['/join'], {
            queryParams: {
              reason: !evalState.isHuman ? 'missing_humanity' : 'missing_org_permset',
            },
          });
        })
      );
    })
  );
};
