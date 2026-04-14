import { requestUrl } from 'obsidian';

/** Known Naver shortener domains */
export const NAVER_SHORT_DOMAINS = ['naver.me', 'me2.do', 'han.gl'] as const;

/** Timeout for URL expansion in milliseconds */
const EXPANSION_TIMEOUT = 5000;

/**
 * Returns true if the URL's hostname is a known Naver shortener.
 * Handles URLs with or without a protocol prefix.
 */
export function isNaverShortUrl(url: string): boolean {
	if (!url) return false;
	try {
		const normalized = url.trim();
		// Add protocol if missing so URL parsing works
		const withProtocol = /^https?:\/\//i.test(normalized)
			? normalized
			: `https://${normalized}`;
		const hostname = new URL(withProtocol).hostname.toLowerCase();
		return NAVER_SHORT_DOMAINS.some(
			(domain) => hostname === domain || hostname.endsWith(`.${domain}`)
		);
	} catch {
		return false;
	}
}

/** Patterns to extract the final URL from the response HTML after redirect */
const CANONICAL_URL_PATTERNS = [
	/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i,
	/<meta[^>]+property=["']og:url["'][^>]+content=["']([^"']+)["']/i,
	/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:url["']/i,
] as const;

/**
 * Fallback: follow the redirect with requestUrl and parse the destination page
 * HTML for canonical/og:url. Used on mobile where Node.js https is unavailable.
 */
async function resolveRedirectWithRequestUrl(url: string): Promise<string | null> {
	try {
		const response = await requestUrl({
			url,
			method: 'GET',
			throw: false,
		});

		const resp = response as {
			url?: string;
			status?: number;
			headers?: Record<string, string>;
			text?: string;
		};

		// Some Obsidian versions expose the final URL
		if (resp.url && resp.url !== url) {
			return resp.url;
		}

		// Check Location header
		if (resp.headers) {
			const location = resp.headers['location'] || resp.headers['Location'];
			if (location) {
				return location;
			}
		}

		// Parse response HTML for canonical / og:url
		if (resp.text) {
			for (const pattern of CANONICAL_URL_PATTERNS) {
				const match = resp.text.match(pattern);
				if (match?.[1]) {
					return match[1];
				}
			}
		}

		return null;
	} catch {
		return null;
	}
}

/**
 * Expands known Naver URL shortener domains to their final destination.
 * Returns the original URL unchanged if expansion fails or times out.
 *
 * Uses Obsidian's requestUrl to follow the redirect and extract the final
 * destination from the response URL, Location header, or HTML canonical/og:url.
 */
export async function expandNaverShortUrl(url: string): Promise<string> {
	if (!isNaverShortUrl(url)) return url;

	const normalized = url.trim();
	const withProtocol = /^https?:\/\//i.test(normalized)
		? normalized
		: `https://${normalized}`;

	try {
		const result = await Promise.race([
			resolveRedirectWithRequestUrl(withProtocol),
			new Promise<null>((resolve) =>
				setTimeout(() => resolve(null), EXPANSION_TIMEOUT)
			),
		]);

		return result ?? url;
	} catch {
		return url;
	}
}

/**
 * Extracts the `art` JWT token from a URL's query string.
 * Returns undefined if the parameter is not present.
 */
export function extractArtToken(url: string): string | undefined {
	try {
		const parsed = new URL(url);
		return parsed.searchParams.get('art') ?? undefined;
	} catch {
		return undefined;
	}
}
