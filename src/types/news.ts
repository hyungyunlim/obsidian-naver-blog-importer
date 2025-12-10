/**
 * Naver News related type definitions
 */

export interface NewsArticle {
	title: string;
	content: string;
	press: string;
	pressId: string;
	articleId: string;
	journalists: string[];
	publishedAt: string;
	modifiedAt?: string;
	category?: string;
	originalUrl?: string;
	url: string;
	images: NewsImage[];
	commentCount?: number;
	comments?: NewsComment[];
}

export interface NewsImage {
	src: string;
	alt?: string;
	caption?: string;
	localPath?: string;
}

export interface NewsComment {
	author: string;
	content: string;
	date: string;
	likes: number;
	dislikes: number;
}

export interface NaverNewsSettings {
	// Storage location
	newsFolder: string;

	// Folder structure options
	organizeByPress: boolean;

	// Image settings
	downloadNewsImages: boolean;
	newsImageFolder: string;

	// Comment settings
	includeNewsComments: boolean;

	// Content options
	includeOriginalUrl: boolean;
}

export const DEFAULT_NEWS_SETTINGS: NaverNewsSettings = {
	newsFolder: 'NaverNews',
	organizeByPress: true,
	downloadNewsImages: true,
	newsImageFolder: 'attachments',
	includeNewsComments: false,
	includeOriginalUrl: true,
};
