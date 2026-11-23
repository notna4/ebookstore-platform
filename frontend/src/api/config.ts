export interface ApiConfig {
  /** Base URL of the REST API, e.g. http://127.0.0.1:8080/api/v1 */
  baseUrl: string;
  /** OpenID Connect issuer (authority) */
  issuer: string;
  clientId: string;
}

/** API mode is on when VITE_API_URL is set; otherwise the app runs on local demo data. */
export const readApiConfig = (env: Record<string, string | undefined> = import.meta.env): ApiConfig | null => {
  const baseUrl = env.VITE_API_URL?.trim();
  if (!baseUrl) return null;
  const issuer = env.VITE_OIDC_ISSUER?.trim();
  if (!issuer) throw new Error('VITE_OIDC_ISSUER must be set together with VITE_API_URL');
  return { baseUrl: baseUrl.replace(/\/$/, ''), issuer, clientId: env.VITE_OIDC_CLIENT_ID?.trim() || 'bookworm-spa' };
};
