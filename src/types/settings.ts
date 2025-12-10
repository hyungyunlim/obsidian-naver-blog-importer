import type { CafeSubscription } from './cafe';

export interface BlogSubscription {
	blogId: string;
	postCount: number;
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
};