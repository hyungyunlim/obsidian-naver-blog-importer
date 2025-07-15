/**
 * Default values and limits used throughout the application
 */

// Default blog post counts
export const DEFAULT_BLOG_POST_COUNT = 10;
export const DEFAULT_SUBSCRIPTION_COUNT = 10;

// Import limits
export const MAX_POST_IMPORT_LIMIT = 1000;
export const DEFAULT_POST_IMPORT_LIMIT = 0; // No limit
export const MAX_SUBSCRIPTION_POST_COUNT = 100;

// File and content limits
export const MAX_FILENAME_LENGTH = 100;
export const MIN_CONTENT_LENGTH_FOR_AI = 50;

// AI token limits
export const AI_TOKEN_LIMITS = {
	default: 4000,
	pro: 10000
} as const;

// Default file extensions
export const DEFAULT_IMAGE_EXTENSION = 'jpg';

// Default CSS values
export const UI_DEFAULTS = {
	modalInputWidth: '100%',
	modalInputMargin: '10px',
	modalGap: '10px',
	modalPadding: '10px',
	dropdownZIndex: 1000,
	modalTimeout: 100,
	blurDelay: 150
} as const;

// Type definitions
export type TokenLimit = typeof AI_TOKEN_LIMITS[keyof typeof AI_TOKEN_LIMITS];