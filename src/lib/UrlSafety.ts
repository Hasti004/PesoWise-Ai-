/**
 * Production-safe URL validation and blocklisting.
 * Prevents DNS resolution errors for confirmed legacy/dead domains.
 */

const BLOCKED_DOMAINS = [
  "spendingcalculator.xyz",
  "backend.spendingcalculator.xyz"
];

export class UrlSafety {
  /**
   * Sanitizes a potential external URL.
   * Returns null if the URL is invalid, insecure (not https), or part of a blocked domain.
   */
  static sanitizeExternalUrl(url: string | null | undefined): string | null {
    if (!url || typeof url !== 'string') return null;

    try {
      const parsed = new URL(url);
      
      // 1. Block insecure URLs (unless they are localhost for local dev)
      const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
      if (parsed.protocol !== 'https:' && !isLocal) {
        console.warn(`[UrlSafety] Rejected insecure URL: ${url}`);
        return null;
      }

      // 2. Block known dead/legacy domains
      if (BLOCKED_DOMAINS.some(domain => parsed.hostname === domain || parsed.hostname.endsWith('.' + domain))) {
        console.warn(`[UrlSafety] Blocked legacy/dead URL: ${url}`);
        return null;
      }

      return url;
    } catch (_) {
      // Not a valid URL
      return null;
    }
  }

  /**
   * Safe fetch wrapper that validates the URL before calling.
   */
  static async safeFetch(url: string, options?: RequestInit): Promise<Response | null> {
    const sanitized = this.sanitizeExternalUrl(url);
    if (!sanitized) return null;

    try {
      return await fetch(sanitized, options);
    } catch (err) {
      console.error(`[UrlSafety] Network error for ${url}:`, err);
      return null;
    }
  }
}
