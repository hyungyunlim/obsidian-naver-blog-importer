/**
 * Naver Cafe API endpoints and URL patterns
 */

// Base URLs
export const CAFE_BASE_URL = 'https://cafe.naver.com';
export const CAFE_MOBILE_BASE_URL = 'https://m.cafe.naver.com';

// API Endpoints
export const CAFE_ARTICLE_LIST_ENDPOINT = `${CAFE_BASE_URL}/ArticleList.nhn`;
export const CAFE_ARTICLE_READ_ENDPOINT = `${CAFE_BASE_URL}/ArticleRead.nhn`;

// Mobile API (JSON responses)
export const CAFE_MOBILE_API_BASE = `${CAFE_MOBILE_BASE_URL}/ca-fe/web/cafes`;

// URL builders
export const buildCafeArticleListUrl = (cafeId: string, menuId?: number, page = 1): string => {
	const params = new URLSearchParams({
		'search.clubid': cafeId,
		'search.page': page.toString(),
		'search.perPage': '50',
	});
	if (menuId) {
		params.set('search.menuid', menuId.toString());
	}
	return `${CAFE_ARTICLE_LIST_ENDPOINT}?${params.toString()}`;
};

export const buildCafeArticleReadUrl = (cafeId: string, articleId: string): string => {
	const params = new URLSearchParams({
		'clubid': cafeId,
		'articleid': articleId,
	});
	return `${CAFE_ARTICLE_READ_ENDPOINT}?${params.toString()}`;
};

// Mobile API URL builders (returns JSON)
export const buildCafeMobileArticleUrl = (cafeId: string, articleId: string): string => {
	return `${CAFE_MOBILE_API_BASE}/${cafeId}/articles/${articleId}`;
};

export const buildCafeMobileArticleListUrl = (cafeId: string, menuId?: number, page = 1): string => {
	const params = new URLSearchParams({
		'page': page.toString(),
		'perPage': '50',
	});
	if (menuId) {
		params.set('menuId', menuId.toString());
	}
	return `${CAFE_MOBILE_API_BASE}/${cafeId}/articles?${params.toString()}`;
};

export const buildCafeMobileMenuListUrl = (cafeId: string): string => {
	return `${CAFE_MOBILE_API_BASE}/${cafeId}/menus`;
};

// Direct article URL (for user-facing links)
export const buildCafeArticleDirectUrl = (cafeUrl: string, articleId: string): string => {
	return `${CAFE_BASE_URL}/${cafeUrl}/${articleId}`;
};

// URL parsing patterns
export const CAFE_URL_PATTERNS = {
	// https://cafe.naver.com/cafename/12345
	directUrl: /cafe\.naver\.com\/([^\/]+)\/(\d+)/,
	// https://cafe.naver.com/ArticleRead.nhn?clubid=123&articleid=456
	articleReadUrl: /ArticleRead\.nhn\?.*clubid=(\d+).*articleid=(\d+)/,
	// https://cafe.naver.com/cafename?articleid=12345
	queryUrl: /cafe\.naver\.com\/([^\/\?]+)\?.*articleid=(\d+)/,
	// Mobile URL: https://m.cafe.naver.com/cafename/12345
	mobileUrl: /m\.cafe\.naver\.com\/([^\/]+)\/(\d+)/,
} as const;

// Parse cafe URL to extract cafeUrl/cafeId and articleId
export const parseCafeUrl = (url: string): { cafeUrl?: string; cafeId?: string; articleId?: string } | null => {
	// Try direct URL pattern first
	let match = url.match(CAFE_URL_PATTERNS.directUrl);
	if (match) {
		return { cafeUrl: match[1], articleId: match[2] };
	}

	// Try ArticleRead.nhn pattern
	match = url.match(CAFE_URL_PATTERNS.articleReadUrl);
	if (match) {
		return { cafeId: match[1], articleId: match[2] };
	}

	// Try query URL pattern
	match = url.match(CAFE_URL_PATTERNS.queryUrl);
	if (match) {
		return { cafeUrl: match[1], articleId: match[2] };
	}

	// Try mobile URL pattern
	match = url.match(CAFE_URL_PATTERNS.mobileUrl);
	if (match) {
		return { cafeUrl: match[1], articleId: match[2] };
	}

	return null;
};
