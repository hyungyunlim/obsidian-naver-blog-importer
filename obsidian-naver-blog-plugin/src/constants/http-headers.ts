/**
 * HTTP headers and user agents used for API requests
 */

// User agent strings for different request types
export const USER_AGENTS = {
	default: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
	chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
	images: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
} as const;

// Common headers for Naver requests
export const NAVER_HEADERS = {
	referer: 'https://blog.naver.com/',
	userAgent: USER_AGENTS.chrome
} as const;

// API version headers
export const API_VERSIONS = {
	anthropic: '2023-06-01',
	openai: 'v1'
} as const;

// Content type headers
export const CONTENT_TYPES = {
	json: 'application/json',
	formData: 'multipart/form-data',
	urlEncoded: 'application/x-www-form-urlencoded'
} as const;

// Type definitions
export type UserAgent = typeof USER_AGENTS[keyof typeof USER_AGENTS];
export type ContentType = typeof CONTENT_TYPES[keyof typeof CONTENT_TYPES];