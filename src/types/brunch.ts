/**
 * Brunch (Kakao) platform type definitions
 */

export interface BrunchPost {
	platform: 'brunch';
	id: string;                    // postId (e.g., "78", "317")
	url: string;                   // full URL

	author: BrunchAuthor;
	content: BrunchContent;
	media: BrunchMedia;
	metadata: BrunchMetadata;
}

export interface BrunchAuthor {
	name: string;                  // Display name (e.g., "EveningDriver")
	username: string;              // @username (e.g., "eveningdriver")
	userId?: string;               // @@userId for RSS (e.g., "eHom")
	profileUrl: string;
	avatar?: string;
	subscribers?: number;
	job?: string;
	bio?: string;
}

export interface BrunchContent {
	title: string;                 // Main title
	subtitle?: string;             // Subtitle if exists
	text: string;                  // Plain text content
	markdown: string;              // Markdown converted content
	html?: string;                 // Original HTML
}

export interface BrunchMedia {
	thumbnail?: string;            // og:image
	images: BrunchImage[];
	videos: BrunchVideo[];
}

export interface BrunchImage {
	url: string;
	caption?: string;
	width?: number;
	height?: number;
}

export interface BrunchVideo {
	url: string;
	type: 'kakaoTV' | 'youtube' | 'other';
	thumbnail?: string;
	videoId?: string;           // Kakao video ID for downloading
	mp4Url?: string;            // Direct MP4 download URL
	duration?: number;          // Duration in seconds
	profile?: string;           // Quality profile (HIGH, MAIN, BASE, LOW)
}

export interface BrunchMetadata {
	publishedAt: string;           // ISO date string
	likes?: number;
	comments?: number;
	keywords: string[];
	series?: BrunchSeries;
}

export interface BrunchSeries {
	title: string;
	url: string;
	episode?: number;
}

export interface BrunchSubscription {
	id: string;
	platform: 'brunch';
	authorUsername: string;        // "@eveningdriver"
	authorUserId?: string;         // "@@eHom" - extracted from RSS URL
	authorName?: string;           // Display name
	rssUrl?: string;               // "https://brunch.co.kr/rss/@@eHom"
	lastCheckedAt?: string;
	lastPostId?: string;           // Last imported post ID
	postCount: number;             // Number of posts to fetch
	createdAt: string;
}

/**
 * Processed Brunch post ready for markdown file creation
 */
export interface ProcessedBrunchPost {
	title: string;
	date: string;
	content: string;
	contentHtml?: string;
	postId: string;
	url: string;
	thumbnail?: string;
	username: string;
	authorName: string;
	originalTags: string[];
	series?: BrunchSeries;
	likes?: number;
	comments?: number;
	subtitle?: string;
	videos?: BrunchVideo[];     // Videos found in the post
}

/**
 * Brunch settings for the plugin
 */
export interface BrunchSettings {
	brunchImportFolder: string;
	downloadBrunchImages: boolean;
	downloadBrunchVideos: boolean;
	subscribedBrunchAuthors: BrunchSubscription[];
	enableBrunchDuplicateCheck: boolean;
}

export const DEFAULT_BRUNCH_SETTINGS: BrunchSettings = {
	brunchImportFolder: 'Brunch Posts',
	downloadBrunchImages: true,
	downloadBrunchVideos: true,
	subscribedBrunchAuthors: [],
	enableBrunchDuplicateCheck: true,
};
