/**
 * Timeout and delay values used throughout the application
 */

// Notice display durations (in milliseconds)
export const NOTICE_TIMEOUTS = {
	short: 2000,      // Brief notifications
	medium: 5000,     // Standard notifications
	long: 10000       // Important notifications
} as const;

// Retry delays (in milliseconds)
export const RETRY_DELAYS = {
	base: 1000,       // Base delay for retries
	multiplier: 2,    // Exponential backoff multiplier
	maxRetries: 3     // Maximum number of retries
} as const;

// UI interaction delays (in milliseconds)
export const UI_DELAYS = {
	focus: 100,       // Delay before focusing inputs
	blur: 150,        // Delay before hiding dropdowns
	autoSync: 5000    // Auto-sync delay after plugin load
} as const;

// API rate limiting delays (in milliseconds)
export const API_DELAYS = {
	betweenPosts: 1000,  // Delay between processing posts
	betweenBlogs: 1000   // Delay between processing blogs
} as const;

// Helper function to calculate exponential backoff delay
export const calculateBackoffDelay = (attempt: number): number => {
	return Math.pow(RETRY_DELAYS.multiplier, attempt) * RETRY_DELAYS.base;
};

// Type definitions
export type NoticeTimeout = typeof NOTICE_TIMEOUTS[keyof typeof NOTICE_TIMEOUTS];
export type UIDelay = typeof UI_DELAYS[keyof typeof UI_DELAYS];
export type APIDelay = typeof API_DELAYS[keyof typeof API_DELAYS];