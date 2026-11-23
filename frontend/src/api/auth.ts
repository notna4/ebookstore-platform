import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import type { ApiConfig } from './config';

/**
 * OpenID Connect sign-in with the authorization-code flow and PKCE (no client secret in the browser).
 * Tokens live in sessionStorage, so they disappear when the tab closes.
 */
export const createUserManager = (config: ApiConfig): UserManager =>
  new UserManager({
    authority: config.issuer,
    client_id: config.clientId,
    redirect_uri: `${window.location.origin}/auth/callback`,
    post_logout_redirect_uri: `${window.location.origin}/`,
    response_type: 'code',
    scope: 'openid profile email',
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: false,
  });
