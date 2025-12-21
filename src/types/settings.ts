import type { CafeSubscription } from './cafe';
import type { NaverNewsSettings } from './news';
import { DEFAULT_NEWS_SETTINGS } from './news';
import type { BrunchSettings } from './brunch';
import { DEFAULT_BRUNCH_SETTINGS } from './brunch';

export interface BlogSubscription {
	id: string;                    // Unique identifier
	blogId: string;
	blogName?: string;             // Display name (fetched from API)
	profileImageUrl?: string;      // Blog profile image URL
	postCount: number;
	createdAt: string;             // ISO date string
	lastSyncedAt?: string;         // Last sync time
	lastLogNo?: string;            // Last imported post logNo for incremental sync
}

export interface CafeSettings {
	naverCookie: string;  // Legacy - will be built from nidAut + nidSes
	nidAut: string;       // NID_AUT cookie value
	nidSes: string;       // NID_SES cookie value
	cafeImportFolder: string;
	includeComments: boolean;
	downloadCafeImages: boolean;
	excludeNotice: boolean;
	excludeRecommended: boolean;
	minContentLength: number;
	subscribedCafes: CafeSubscription[];
	enableCafeDuplicateCheck: boolean;
}

export interface NaverBlogSettings {
	aiProvider: 'openai' | 'anthropic' | 'google' | 'ollama';
	openaiApiKey: string;
	anthropicApiKey: string;
	googleApiKey: string;
	ollamaEndpoint: string;
	aiModel: string;
	defaultFolder: string;
	imageFolder: string;
	enableAiTags: boolean;
	enableAiExcerpt: boolean;
	enableDuplicateCheck: boolean;
	enableImageDownload: boolean;
	subscribedBlogs: string[];
	subscriptionCount: number;
	blogSubscriptions: BlogSubscription[];
	postImportLimit: number;
	// Cafe settings
	cafeSettings: CafeSettings;
	// News settings
	newsSettings: NaverNewsSettings;
	// Brunch settings
	brunchSettings: BrunchSettings;
}

export const DEFAULT_CAFE_SETTINGS: CafeSettings = {
	naverCookie: '',
	nidAut: '',
	nidSes: '',
	cafeImportFolder: 'Naver Cafe Posts',
	includeComments: true,
	downloadCafeImages: true,
	excludeNotice: true,
	excludeRecommended: false,
	minContentLength: 0,
	subscribedCafes: [],
	enableCafeDuplicateCheck: true,
};

export const DEFAULT_SETTINGS: NaverBlogSettings = {
	aiProvider: 'openai',
	openaiApiKey: '',
	anthropicApiKey: '',
	googleApiKey: '',
	ollamaEndpoint: 'http://localhost:11434',
	aiModel: 'gpt-4o-mini',
	defaultFolder: 'Naver Blog Posts',
	imageFolder: 'Naver Blog Posts/attachments',
	enableAiTags: true,
	enableAiExcerpt: true,
	enableDuplicateCheck: true,
	enableImageDownload: false,
	subscribedBlogs: [],
	subscriptionCount: 10,
	blogSubscriptions: [],
	postImportLimit: 0, // 0 means no limit
	cafeSettings: DEFAULT_CAFE_SETTINGS,
	newsSettings: DEFAULT_NEWS_SETTINGS,
	brunchSettings: DEFAULT_BRUNCH_SETTINGS,
};