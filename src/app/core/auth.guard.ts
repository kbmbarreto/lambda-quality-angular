import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { InvitationContext } from './invitation-context.service';
import { map } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth
    .ensureSession()
    .pipe(map((active) => (active ? true : router.createUrlTree(['/login']))));
};
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const invitation = inject(InvitationContext);
  return auth
    .ensureSession()
    .pipe(
      map((active) =>
        active
          ? router.createUrlTree([invitation.token() ? '/convites/aceitar' : '/inicio'])
          : true,
      ),
    );
};
