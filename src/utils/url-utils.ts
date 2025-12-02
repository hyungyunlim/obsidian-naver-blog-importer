/**
 * Utility functions for parsing Naver Blog URLs
 */

export interface ParsedNaverUrl {
	blogId: string;
	logNo: string;
}

/**
 * Check if a string is a valid Naver Blog URL
 */
export function isNaverBlogUrl(text: string | undefined | null): boolean {
	if (!text) return false;
	const trimmed = text.trim();
	return (
		trimmed.includes('blog.naver.com') ||
		trimmed.includes('m.blog.naver.com') ||
		trimmed.includes('m.naver.com/PostView') ||
		trimmed.includes('naver.com/PostView')
	);
}

/**
 * Extract just the blogId from a Naver Blog URL (home page or post URL)
 * Supports:
 * - Desktop home: https://blog.naver.com/blogid or https://blog.naver.com/blogid/
 * - Desktop post: https://blog.naver.com/blogid/logno
 * - Desktop PostView: https://blog.naver.com/PostView.naver?blogId=xxx&logNo=xxx
 * - Mobile: URLs with blogId parameter
 */
export function extractBlogIdFromUrl(url: string): string | null {
	if (!url) return null;

	const trimmed = url.trim();

	// URLs with blogId query parameter (mobile or desktop PostView.naver)
	const blogIdMatch = trimmed.match(/[?&]blogId=([^&]+)/);
	if (blogIdMatch) {
		return blogIdMatch[1];
	}

	// Desktop URLs - extract from path (not PostView.naver format)
	if (trimmed.includes('blog.naver.com')) {
		// Match blogid from path (with or without trailing logno)
		const urlMatch = trimmed.match(/blog\.naver\.com\/([^/?#]+)/);
		if (urlMatch && urlMatch[1] && urlMatch[1] !== 'PostView.naver') {
			return urlMatch[1];
		}
	}

	return null;
}

/**
 * Parse a Naver Blog URL and extract blogId and logNo
 * Supports:
 * - Desktop path: https://blog.naver.com/blogid/logno
 * - Desktop PostView: https://blog.naver.com/PostView.naver?blogId=xxx&logNo=xxx
 * - Mobile blog: https://m.blog.naver.com/PostView.naver?blogId=xxx&logNo=xxx
 * - Mobile naver: https://m.naver.com/PostView.naver?blogId=xxx&logNo=xxx
 */
export function parseNaverBlogUrl(url: string): ParsedNaverUrl | null {
	if (!url) return null;

	const trimmed = url.trim();
	let blogId = '';
	let logNo = '';

	// Check for PostView.naver format with query parameters (desktop or mobile)
	if (trimmed.includes('PostView.naver') || trimmed.includes('PostView.nhn')) {
		const blogIdMatch = trimmed.match(/[?&]blogId=([^&]+)/);
		const logNoMatch = trimmed.match(/[?&]logNo=(\d+)/);

		if (blogIdMatch && logNoMatch) {
			blogId = blogIdMatch[1];
			logNo = logNoMatch[1];
		}
	} else if (trimmed.includes('blog.naver.com')) {
		// Desktop URL format: https://blog.naver.com/blogid/logno
		const urlMatch = trimmed.match(/blog\.naver\.com\/([^/?#]+)\/(\d+)/);
		if (urlMatch) {
			blogId = urlMatch[1];
			logNo = urlMatch[2];
		}
	}

	if (blogId && logNo) {
		return { blogId, logNo };
	}

	return null;
}
