/**
 * Naver News HTML selectors and URL patterns
 */

// HTML Selectors for Naver News articles
export const NAVER_NEWS_SELECTORS = {
	// Metadata
	title: '#title_area span, h2.media_end_head_headline span',
	press: '.media_end_head_top_logo_img',  // alt attribute
	journalists: '.media_end_head_journalist_name',
	publishedAt: '._ARTICLE_DATE_TIME',  // data-date-time attribute
	modifiedAt: '._ARTICLE_MODIFY_DATE_TIME',  // data-modify-date-time attribute
	originalUrl: '.media_end_head_origin_link',  // href attribute
	category: '.media_end_categorize_item',

	// Content
	content: 'article#dic_area',

	// Images
	images: '.end_photo_org img, .nbd_im_w img',
	imageContainer: '.end_photo_org, .nbd_im_w',
	imageCaptions: 'em.img_desc',

	// Comments
	commentCount: '#comment_count',
} as const;

// URL patterns for Naver News
export const NAVER_NEWS_URL_PATTERNS = {
	// https://n.news.naver.com/article/{oid}/{aid}
	shortUrl: /^https?:\/\/n\.news\.naver\.com\/article\/(\d+)\/(\d+)/,

	// https://n.news.naver.com/mnews/article/{oid}/{aid}
	mnewsUrl: /^https?:\/\/n\.news\.naver\.com\/mnews\/article\/(\d+)\/(\d+)/,

	// https://news.naver.com/main/read.naver?mode=LSD&mid=sec&oid={oid}&aid={aid}
	longUrl: /[?&]oid=(\d+).*[?&]aid=(\d+)|[?&]aid=(\d+).*[?&]oid=(\d+)/,

	// Mobile URL pattern
	mobileUrl: /^https?:\/\/m\.news\.naver\.com\/article\/(\d+)\/(\d+)/,
} as const;

// News image domain
export const NAVER_NEWS_IMAGE_DOMAIN = 'imgnews.pstatic.net';

// Comment API endpoint
export const NAVER_NEWS_COMMENT_API = 'https://apis.naver.com/commentBox/cbox5/web_naver_list_jsonp.json';

// Comment API parameters
export const NAVER_NEWS_COMMENT_PARAMS = {
	ticket: 'news',
	pageSize: 20,
} as const;
