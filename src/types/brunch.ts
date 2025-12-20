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

/**
 * Brunch comment author information
 * Compatible with social-archiver's Author interface
 */
export interface BrunchCommentAuthor {
	id: string;              // commentUserId (internal ID, e.g., "i4XQ")
	name: string;            // commentUserName (display name, e.g., "ZHTU")
	profileUrl?: string;     // URL to author's Brunch profile (if available)
	isMembership?: boolean;  // Whether the user has membership (userMembershipActive)
}

/**
 * Brunch comment structure
 * Designed for reusability across platforms (Brunch, Naver Cafe, etc.)
 */
export interface BrunchComment {
	id: string;              // comment no (unique identifier)
	author: BrunchCommentAuthor;
	content: string;         // message content
	timestamp: string;       // ISO date string (converted from createTime)
	likes?: number;          // Like count (if available)
	parentId?: string;       // parentNo - for nested replies
	replies?: BrunchComment[]; // children.list - nested replies
}

/**
 * Raw Brunch API comment response structure
 * Used internally for parsing API response
 */
export interface BrunchApiCommentResponse {
	code: number;
	data: {
		list: BrunchApiComment[];
		totalCount: number;
	};
}

export interface BrunchApiComment {
	no: number;
	commentUserName: string;
	commentUserId: string;
	message: string;
	createTime: number;      // Unix timestamp in milliseconds
	parentNo: number | null;
	children?: {
		list: BrunchApiComment[];
	};
	userMembershipActive?: boolean;
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
	userId?: string;            // Internal user ID for API calls (e.g., "ftEI")
	authorName: string;
	originalTags: string[];
	series?: BrunchSeries;
	likes?: number;
	commentCount?: number;      // Comment count for metadata
	commentData?: BrunchComment[]; // Actual comment content (if fetched)
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
	downloadBrunchComments: boolean;  // Whether to fetch and include comments
	subscribedBrunchAuthors: BrunchSubscription[];
	enableBrunchDuplicateCheck: boolean;
}

export const DEFAULT_BRUNCH_SETTINGS: BrunchSettings = {
	brunchImportFolder: 'Brunch Posts',
	downloadBrunchImages: true,
	downloadBrunchVideos: true,
	downloadBrunchComments: true,     // Default to fetching comments
	subscribedBrunchAuthors: [],
	enableBrunchDuplicateCheck: true,
};
