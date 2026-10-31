import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom } from 'rxjs';
import { filter, take } from 'rxjs/operators';
import { environment } from '../environments/environment';

export interface MembershipStatus {
  registered: boolean;
  human: boolean;
  member: boolean;
  username?: string;
  emails: string[];
  origin?: string;
  appName?: string;
  orgName?: string;
}

export interface EnrollmentRequest {
  origin: string;
  firstName: string;
  lastName: string;
  email: string;
  homeAddress: {
    street: string;
    city: string;
    state: string;
    zipCode: string;
  };
  notifyByEmail?: boolean;
}

export interface EnrollmentResult {
  enrolled: boolean;
  alreadyMember: boolean;
  origin?: string;
  providerName: string | null;
  isTestProvider: boolean;
}

export type EnrollmentDenialReason =
  | 'not_registered'
  | 'not_human'
  | 'org_not_configured'
  | 'no_provider'
  | 'invalid_address';

/**
 * Self-service "Become a member" client for Bookins.io PaaS applications.
 *
 * Uses the signed Auth0 ID token (`idTokenClaims$.__raw`) to authenticate against
 * `https://bookins.io/api/self-service/paas/{status,enroll}`, matching the
 * pattern in grokism.io and decenthealth.io.
 */
@Injectable({ providedIn: 'root' })
export class MembershipService {
  private readonly bookinsBase = (environment.bookinsApiBase || 'https://bookins.io').replace(/\/+$/, '');

  constructor(private http: HttpClient, private auth: AuthService) {}

  private async headers(): Promise<HttpHeaders> {
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

  async getStatus(
    origin: string = typeof window !== 'undefined' ? window.location.origin : environment.auth0.appUrl
  ): Promise<MembershipStatus> {
    const headers = await this.headers();
    return firstValueFrom(
      this.http.get<MembershipStatus>(
        `${this.bookinsBase}/api/self-service/paas/status?origin=${encodeURIComponent(origin)}`,
        { headers }
      )
    );
  }

  async enroll(body: EnrollmentRequest): Promise<EnrollmentResult> {
    const headers = await this.headers();
    return firstValueFrom(
      this.http.post<EnrollmentResult>(
        `${this.bookinsBase}/api/self-service/paas/enroll`,
        body,
        { headers }
      )
    );
  }
}
