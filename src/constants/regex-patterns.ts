/**
 * Regular expressions and patterns used throughout the application
 */

// Image processing patterns
export const IMAGE_PATTERNS = {
	markdown: /!\[([^\]]*)\]\(([^)]+)\)/g,
	invalidChars: /[<>:"/\\|?*]/g,
	fileExtension: /\.(jpg|jpeg|png|gif|webp)$/i,
	queryParams: /\?.*$/,
	thumbnailParams: /[?&](w|h|width|height)=\d+/i
} as const;

// URL parsing patterns
export const URL_PATTERNS = {
	naverBlogPost: new RegExp('https?://(?:m\\.)?blog\\.naver\\.com/([^/]+)/(\\d+)'),
	naverMobileBlog: /m\.blog\.naver\.com/,
	naverDesktopBlog: /blog\.naver\.com/
} as const;

// Content cleaning patterns
export const CONTENT_PATTERNS = {
	frontmatter: /^---\n([\s\S]*?)\n---\n([\s\S]*)$/,
	markdownLinks: /\[([^\]]*)\]\([^)]*\)/g,
	markdownImages: /!\[([^\]]*)\]\([^)]*\)/g,
	markdownFormatting: /[#*`]/g,
	extraSpaces: /^\s+|\s+$/g,
	brackets: /\[.*?\]/g
} as const;

// File validation patterns
export const FILE_PATTERNS = {
	validImageDomain: /^https?:\/\/(blogfiles|postfiles|mblogthumb-phinf|blogpfthumb-phinf)\.pstatic\.net/,
	naverProfilePath: /ssl\.pstatic\.net\/static\/blog\/profile\//
} as const;

// Image filtering patterns for skipping unwanted images
export const SKIP_IMAGE_PATTERNS = [
	// Naver blog editor assets
	/se-sticker/i,
	/se-emoticon/i,
	/editor/i,
	/naverblog_pc/i,

	// Common animation and UI patterns (GIF removed - handled by domain check)
	/loading/i,
	/spinner/i,
	/animation/i,
	// Note: removed /thumb/i as it incorrectly matches cafeptthumb-phinf domain
	
	// Profile and background images
	/profile/i,
	/defaultimg/i,
	/bg_/i,
	/background/i,
	/_bg/i,
	
	// Naver UI elements
	/icon/i,
	/logo/i,
	/button/i,
	
	// Size indicators (very small images are likely UI elements)
	/1x1/,
	/spacer/i,
	/dot\./i,
	
	// Common UI image names
	/arrow/i,
	/bullet/i,
	/divider/i
] as const;

// Alt text filtering patterns (Korean)
export const SKIP_ALT_TEXT_PATTERNS = [
	/이모티콘/i,
	/스티커/i,
	/애니메이션/i,
	/로딩/i,
	/아이콘/i,
	/profile/i,
	/background/i,
	/프로필/i,
	/배경/i
] as const;

// Naver CDN URL encoding patterns
export const NAVER_CDN_PATTERNS = {
	year2018: /\/MjAxOA%3D%3D\//g,
	year2019: /\/MjAxOQ%3D%3D\//g,
	year2020: /\/MjAyMA%3D%3D\//g,
	year2021: /\/MjAyMQ%3D%3D\//g,
	year2022: /\/MjAyMg%3D%3D\//g,
	year2023: /\/MjAyMw%3D%3D\//g,
	year2024: /\/MjAyNA%3D%3D\//g,
	year2025: /\/MjAyNQ%3D%3D\//g
} as const;

// Type definitions
export type ImagePattern = typeof IMAGE_PATTERNS[keyof typeof IMAGE_PATTERNS];
export type URLPattern = typeof URL_PATTERNS[keyof typeof URL_PATTERNS];
export type ContentPattern = typeof CONTENT_PATTERNS[keyof typeof CONTENT_PATTERNS];