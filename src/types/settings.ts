export interface BlogSubscription {
	blogId: string;
	postCount: number;
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
}

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
	postImportLimit: 0 // 0 means no limit
};