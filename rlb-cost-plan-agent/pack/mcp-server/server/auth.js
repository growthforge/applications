// @ts-check
/**
 * Demo authentication: bearer tokens from the environment (one per test client), compared in
 * constant time.
 *
 * This is for the demo and a test environment only. In production the server sits behind
 * Microsoft Entra ID: Copilot Studio is configured with OAuth 2.0 (manual), the server
 * validates the token's issuer and audience (its own application ID URI) and scopes, and,
 * once it reads real cost data, calls SharePoint or the cost system on behalf of the signed-in
 * user rather than with a shared credential. See README.md, "Authentication".
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server';

export const MIN_TOKEN_LENGTH = 32;
export const DEMO_SCOPE = 'costplan.read';

/**
 * @param {string[]} tokens the values from MCP_BEARER_TOKEN (one or more)
 * @returns {import('@modelcontextprotocol/server').OAuthTokenVerifier}
 */
export function staticTokenVerifier(tokens) {
  if (!Array.isArray(tokens) || !tokens.length || tokens.some((t) => typeof t !== 'string' || t.length < MIN_TOKEN_LENGTH)) {
    throw new Error(`MCP_BEARER_TOKEN values must each be at least ${MIN_TOKEN_LENGTH} characters`);
  }
  const wants = tokens.map((t) => createHash('sha256').update(t).digest());
  return {
    async verifyAccessToken(token) {
      const got = createHash('sha256').update(String(token)).digest();
      // Compare against every configured token so the time taken does not reveal which matched.
      let match = -1;
      wants.forEach((w, i) => { if (timingSafeEqual(w, got) && match < 0) match = i; });
      if (match < 0) throw new OAuthError(OAuthErrorCode.InvalidToken, 'The bearer token is not valid for this server.');
      // The SDK refuses tokens without an expiry; a static demo token is valid for the next hour on every check.
      return { token, clientId: `demo-client-${match + 1}`, scopes: [DEMO_SCOPE], expiresAt: Math.floor(Date.now() / 1000) + 3600 };
    },
  };
}
