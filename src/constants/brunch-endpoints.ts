/**
 * Brunch (Kakao) platform constants and patterns
 */

// Base URLs
export const BRUNCH_BASE_URL = 'https://brunch.co.kr';
export const BRUNCH_API_URL = 'https://api.brunch.co.kr';
export const BRUNCH_IMAGE_CDN = 'https://img1.daumcdn.net';

// API endpoints for fetching article list (pagination)
export const BRUNCH_ARTICLE_LIST_API = (username: string, lastTime?: number) => {
	const params = new URLSearchParams({
		thumbnail: 'Y',
		membershipContent: 'false'
	});
	if (lastTime) {
		params.set('lastTime', lastTime.toString());
	}
	return `${BRUNCH_API_URL}/v2/article/@${username}?${params.toString()}`;
};

// API endpoint for keyword/magazine article list (pagination)
export const BRUNCH_KEYWORD_API = (groupId: string, publishTime?: number, pickContentId?: string) => {
	const params = new URLSearchParams();
	if (publishTime) {
		params.set('publishTime', publishTime.toString());
	}
	if (pickContentId) {
		params.set('pickContentId', pickContentId);
	}
	const queryString = params.toString();
	return `${BRUNCH_API_URL}/v1/top/keyword/group/${groupId}${queryString ? '?' + queryString : ''}`;
};

// API endpoint for brunchbook/magazine article list
export const BRUNCH_MAGAZINE_ARTICLES_API = (magazineId: string) =>
	`${BRUNCH_API_URL}/v1/magazine/${magazineId}/articles`;

// API endpoint for fetching comments
// userId is the internal user ID (e.g., "ftEI"), articleNo is the post number
export const BRUNCH_COMMENTS_API = (userId: string, articleNo: string) =>
	`${BRUNCH_API_URL}/v2/@@${userId}/${articleNo}/comments`;

// URL patterns
export const BRUNCH_AUTHOR_URL = (username: string) =>
	`${BRUNCH_BASE_URL}/@${username}`;

export const BRUNCH_POST_URL = (username: string, postId: string) =>
	`${BRUNCH_BASE_URL}/@${username}/${postId}`;

export const BRUNCH_RSS_URL = (userId: string) =>
	`${BRUNCH_BASE_URL}/rss/@@${userId}`;

export const BRUNCH_BOOK_URL = (bookId: string) =>
	`${BRUNCH_BASE_URL}/brunchbook/${bookId}`;

export const BRUNCH_KEYWORD_URL = (keyword: string, keywordType: string = 'g') =>
	`${BRUNCH_BASE_URL}/keyword/${encodeURIComponent(keyword)}?q=${keywordType}`;

// Regex patterns for URL parsing
export const BRUNCH_URL_PATTERNS = {
	// Match @username/postId from URL
	post: /@([^/]+)\/(\d+)/,
	// Match @username from author page URL
	author: /@([^/]+)$/,
	// Match @@userId from RSS URL
	rssUserId: /@@(\w+)/,
	// Match brunchbook ID
	book: /\/brunchbook\/([^/]+)/,
	// Match keyword page URL
	keyword: /\/keyword\/([^/?]+)/,
} as const;

// HTML selectors for content extraction
export const BRUNCH_SELECTORS = {
	// Main content container
	wrapBody: '.wrap_body',
	wrapItem: '.wrap_item',

	// Content type classes
	itemTypeText: 'item_type_text',
	itemTypeImg: 'item_type_img',
	itemTypeHr: 'item_type_hr',
	itemTypeQuotation: 'item_type_quotation',
	itemTypeVideo: 'item_type_video',
	itemTypeOpengraph: 'item_type_opengraph',

	// Meta selectors
	ogTitle: 'meta[property="og:title"]',
	ogDescription: 'meta[property="og:description"]',
	ogImage: 'meta[property="og:image"]',
	ogRegDate: 'meta[property="og:regDate"]',
	ogAuthor: 'meta[property="og:article:author"]',

	// RSS link
	rssLink: 'link[type="application/rss+xml"]',

	// Image elements
	imgCaption: '.text_caption',
	imgFloat: '.wrap_img_float',

	// Author info
	authorLink: 'a[href^="https://brunch.co.kr/@"]',

	// Keywords/tags
	keywordLink: 'a[href*="/keyword/"]',

	// Series info
	seriesLink: 'a[href*="/brunchbook/"]',
} as const;

// Image URL transformation
export const BRUNCH_IMAGE_PATTERNS = {
	// Extract original URL from thumbnail URL
	fnameParam: /fname=(.+)$/,
	// Replace thumbnail size
	thumbSize: /thumb\/[^/]+/,
	// High resolution replacement
	highResFormat: 'thumb/R1280x0.fwebp',
} as const;

// Rate limiting
export const BRUNCH_RATE_LIMITS = {
	// Delay between individual page requests (ms)
	requestDelay: 1000,
	// Delay between RSS polling (ms) - 1 hour recommended
	rssPollingInterval: 3600000,
	// Max posts per RSS feed
	rssMaxPosts: 20,
} as const;

// Content type mapping for markdown conversion
export const BRUNCH_CONTENT_TYPE_MAP: Record<string, string> = {
	'item_type_text': 'text',
	'item_type_img': 'image',
	'item_type_hr': 'divider',
	'item_type_quotation': 'quote',
	'item_type_video': 'video',
	'item_type_opengraph': 'embed',
} as const;
