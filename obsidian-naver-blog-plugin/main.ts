import { 
	App, 
	Plugin, 
	PluginSettingTab, 
	Setting, 
	Modal, 
	Notice, 
	TFile,
	TFolder,
	requestUrl,
	RequestUrlParam
} from 'obsidian';

import { NaverBlogFetcher, NaverBlogPost } from './naver-blog-fetcher';

// Translation interface
interface Translations {
	commands: {
		'import-single-post': string;
		'import-blog-url': string;
		'sync-subscribed-blogs': string;
		'ai-fix-layout': string;
	};
	settings: {
		title: string;
		ai_configuration: string;
		ai_provider: string;
		ai_provider_desc: string;
		ai_model: string;
		ai_model_desc: string;
		openai_api_key: string;
		openai_api_key_desc: string;
		anthropic_api_key: string;
		anthropic_api_key_desc: string;
		google_api_key: string;
		google_api_key_desc: string;
		ollama_endpoint: string;
		ollama_endpoint_desc: string;
		default_folder: string;
		default_folder_desc: string;
		image_folder: string;
		image_folder_desc: string;
		enable_ai_tags: string;
		enable_ai_tags_desc: string;
		enable_ai_excerpt: string;
		enable_ai_excerpt_desc: string;
		enable_duplicate_check: string;
		enable_duplicate_check_desc: string;
		enable_image_download: string;
		enable_image_download_desc: string;
		post_import_limit: string;
		post_import_limit_desc: string;
		subscribed_blogs: string;
		add_blog_id: string;
		add_blog_id_desc: string;
		add_button: string;
		remove_button: string;
		sync_button: string;
		no_subscribed_blogs: string;
		posts_label: string;
	};
	notices: {
		api_key_required: string;
		set_api_key: string;
		no_active_file: string;
		ai_formatting_progress: string;
		content_too_short: string;
		ai_formatting_failed: string;
		ai_formatting_success: string;
		invalid_api_key: string;
		api_quota_exceeded: string;
		network_error: string;
		syncing_blog: string;
		sync_completed: string;
		subscribed_to: string;
		unsubscribed_from: string;
		blog_already_subscribed: string;
		file_already_exists: string;
		processing_post: string;
		post_imported: string;
		import_failed: string;
		downloading_images: string;
		image_download_complete: string;
		generating_ai_tags: string;
		generating_ai_excerpt: string;
		post_limit_exceeded: string;
	};
	modals: {
		import_single_post: {
			title: string;
			blog_id_label: string;
			blog_id_placeholder: string;
			log_no_label: string;
			log_no_placeholder: string;
			import_button: string;
			cancel_button: string;
		};
		import_blog_url: {
			title: string;
			url_label: string;
			url_placeholder: string;
			import_button: string;
			cancel_button: string;
		};
		subscribe_blog: {
			title: string;
			blog_id_label: string;
			blog_id_desc: string;
			blog_id_placeholder: string;
			subscribe_button: string;
		};
	};
	errors: {
		invalid_url: string;
		invalid_blog_id: string;
		invalid_log_no: string;
		fetch_failed: string;
		parse_failed: string;
		save_failed: string;
		ai_error: string;
		network_timeout: string;
		unauthorized: string;
		rate_limit: string;
	};
	providers: {
		openai: string;
		anthropic: string;
		google: string;
		ollama: string;
	};
}

// Translation helper class
class I18n {
	private translations: Translations;
	private app: App;
	
	constructor(app: App) {
		this.app = app;
		this.translations = this.getDefaultTranslations();
	}
	
	async loadTranslations(locale: string) {
		console.log(`Loading translations for locale: ${locale}`);
		
		try {
			// Try to load locale-specific translations from plugin directory
			const pluginDir = (this.app.vault.adapter as any).basePath;
			const manifestPath = `${pluginDir}/.obsidian/plugins/obsidian-naver-blog-plugin/lang/${locale}.json`;
			
			// Use Obsidian's file system to read the translation file
			const translationFile = this.app.vault.adapter.read(manifestPath);
			if (translationFile) {
				const translationData = await translationFile;
				this.translations = JSON.parse(translationData);
				console.log(`Successfully loaded translations from file: ${locale}`);
				return;
			}
		} catch (error) {
			console.log(`Failed to load translations file for ${locale}:`, error);
		}
		
		// Load built-in translations
		if (locale === 'ko' || locale.startsWith('ko')) {
			this.translations = this.getKoreanTranslations();
			console.log(`Loaded built-in Korean translations`);
		} else {
			// Load default English translations
			this.translations = this.getDefaultTranslations();
			console.log(`Loaded built-in English translations`);
		}
	}
	
	t(key: string, variables?: Record<string, string>): string {
		const keys = key.split('.');
		let value: any = this.translations;
		
		for (const k of keys) {
			value = value?.[k];
		}
		
		if (typeof value !== 'string') {
			return key; // Return key if translation not found
		}
		
		// Replace variables in the format {{variable}}
		if (variables) {
			return value.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
				return variables[varName] || match;
			});
		}
		
		return value;
	}
	
	private getDefaultTranslations(): Translations {
		return {
			commands: {
				'import-single-post': 'Import Single Post by URL',
				'import-blog-url': 'Import All Posts from Blog',
				'sync-subscribed-blogs': 'Sync Subscribed Blogs',
				'ai-fix-layout': 'AI Fix Layout and Format (Preserve Content 100%)'
			},
			settings: {
				title: 'Naver Blog Importer Settings',
				ai_configuration: 'AI Configuration',
				ai_provider: 'AI Provider',
				ai_provider_desc: 'Choose your AI service provider',
				ai_model: 'AI Model',
				ai_model_desc: 'Select the model to use for AI features',
				openai_api_key: 'OpenAI API Key',
				openai_api_key_desc: 'Enter your OpenAI API key',
				anthropic_api_key: 'Anthropic API Key',
				anthropic_api_key_desc: 'Enter your Anthropic API key',
				google_api_key: 'Google API Key',
				google_api_key_desc: 'Enter your Google Gemini API key',
				ollama_endpoint: 'Ollama Endpoint',
				ollama_endpoint_desc: 'Ollama server endpoint (default: http://localhost:11434)',
				default_folder: 'Default Folder',
				default_folder_desc: 'Folder where imported posts will be saved',
				image_folder: 'Image Folder',
				image_folder_desc: 'Folder where images will be saved',
				enable_ai_tags: 'Enable AI Tags',
				enable_ai_tags_desc: 'Generate tags using AI (requires API key for selected provider)',
				enable_ai_excerpt: 'Enable AI Excerpt',
				enable_ai_excerpt_desc: 'Generate excerpts using AI (requires API key for selected provider)',
				enable_duplicate_check: 'Enable Duplicate Check',
				enable_duplicate_check_desc: 'Skip importing posts that already exist (based on logNo)',
				enable_image_download: 'Enable Image Download',
				enable_image_download_desc: 'Download images locally and update links',
				post_import_limit: 'Post Import Limit',
				post_import_limit_desc: 'Maximum number of posts to import at once (0 = unlimited)',
				subscribed_blogs: 'Subscribed Blogs',
				add_blog_id: 'Add Blog ID',
				add_blog_id_desc: 'Enter a new blog ID and click the add button',
				add_button: 'Add',
				remove_button: 'Remove',
				sync_button: 'Sync',
				no_subscribed_blogs: 'No subscribed blogs',
				posts_label: 'Posts'
			},
			notices: {
				api_key_required: '{{provider}} API Key required for AI formatting',
				set_api_key: 'Please set your API key in plugin settings',
				no_active_file: 'No active file selected for formatting',
				ai_formatting_progress: 'AI layout fixing in progress...',
				content_too_short: 'Content too short for AI formatting (minimum 50 characters)',
				ai_formatting_failed: 'AI formatting failed. Please try again',
				ai_formatting_success: 'Layout and formatting fixed by AI!',
				invalid_api_key: 'Invalid API key',
				api_quota_exceeded: 'API quota exceeded',
				network_error: 'Network error - please check your connection',
				syncing_blog: 'Syncing blog {{progress}}: {{blogId}} ({{postCount}} posts)',
				sync_completed: 'Sync completed: {{successCount}}/{{totalCount}} posts',
				subscribed_to: 'Subscribed to {{blogId}}',
				unsubscribed_from: 'Unsubscribed from {{blogId}}',
				blog_already_subscribed: 'Blog already subscribed: {{blogId}}',
				file_already_exists: 'File already exists: {{filename}}',
				processing_post: 'Processing post: {{title}}',
				post_imported: 'Post imported: {{title}}',
				import_failed: 'Import failed: {{error}}',
				downloading_images: 'Downloading images...',
				image_download_complete: 'Image download complete: {{count}} images',
				generating_ai_tags: 'Generating AI tags...',
				generating_ai_excerpt: 'Generating AI excerpt...',
				post_limit_exceeded: 'Maximum limit is 1000 posts. Value adjusted to 1000.'
			},
			modals: {
				import_single_post: {
					title: 'Import Single Post by URL',
					blog_id_label: 'Blog ID',
					blog_id_placeholder: 'e.g., myblog',
					log_no_label: 'Post URL or LogNo',
					log_no_placeholder: 'URL or LogNo (e.g., https://blog.naver.com/yonofbooks/220883239733)',
					import_button: 'Import Post',
					cancel_button: 'Cancel'
				},
				import_blog_url: {
					title: 'Import All Posts from Blog',
					url_label: 'Blog ID',
					url_placeholder: 'e.g., yonofbooks',
					import_button: 'Import All Posts',
					cancel_button: 'Cancel'
				},
				subscribe_blog: {
					title: 'Subscribe to Naver Blog',
					blog_id_label: 'Blog ID',
					blog_id_desc: 'Enter the Naver Blog ID to subscribe to',
					blog_id_placeholder: 'Blog ID',
					subscribe_button: 'Subscribe'
				}
			},
			errors: {
				invalid_url: 'Invalid URL format',
				invalid_blog_id: 'Invalid blog ID',
				invalid_log_no: 'Invalid post number',
				fetch_failed: 'Failed to fetch post: {{error}}',
				parse_failed: 'Failed to parse post: {{error}}',
				save_failed: 'Failed to save file: {{error}}',
				ai_error: 'AI processing error: {{error}}',
				network_timeout: 'Network timeout',
				unauthorized: 'Unauthorized request - please check your API key',
				rate_limit: 'Rate limit exceeded - please try again later'
			},
			providers: {
				openai: 'OpenAI (GPT)',
				anthropic: 'Anthropic (Claude)',
				google: 'Google (Gemini)',
				ollama: 'Ollama (Local)'
			}
		};
	}
	
	private getKoreanTranslations(): Translations {
		return {
			commands: {
				'import-single-post': 'URL로 단일 포스트 가져오기',
				'import-blog-url': '블로그 전체 포스트 가져오기',
				'sync-subscribed-blogs': '구독 블로그 동기화',
				'ai-fix-layout': 'AI 레이아웃 수정 및 포맷 (내용 100% 보존)'
			},
			settings: {
				title: '네이버 블로그 가져오기 설정',
				ai_configuration: 'AI 설정',
				ai_provider: 'AI 제공업체',
				ai_provider_desc: 'AI 서비스 제공업체를 선택하세요',
				ai_model: 'AI 모델',
				ai_model_desc: 'AI 기능에 사용할 모델을 선택하세요',
				openai_api_key: 'OpenAI API 키',
				openai_api_key_desc: 'OpenAI API 키를 입력하세요',
				anthropic_api_key: 'Anthropic API 키',
				anthropic_api_key_desc: 'Anthropic API 키를 입력하세요',
				google_api_key: 'Google API 키',
				google_api_key_desc: 'Google Gemini API 키를 입력하세요',
				ollama_endpoint: 'Ollama 엔드포인트',
				ollama_endpoint_desc: 'Ollama 서버 엔드포인트 (기본값: http://localhost:11434)',
				default_folder: '기본 폴더',
				default_folder_desc: '가져온 포스트가 저장될 폴더',
				image_folder: '이미지 폴더',
				image_folder_desc: '이미지가 저장될 폴더',
				enable_ai_tags: 'AI 태그 생성 활성화',
				enable_ai_tags_desc: 'AI를 사용하여 태그를 생성합니다 (선택한 제공업체의 API 키 필요)',
				enable_ai_excerpt: 'AI 요약 생성 활성화',
				enable_ai_excerpt_desc: 'AI를 사용하여 요약을 생성합니다 (선택한 제공업체의 API 키 필요)',
				enable_duplicate_check: '중복 확인 활성화',
				enable_duplicate_check_desc: '이미 존재하는 포스트 가져오기 건너뛰기 (logNo 기준)',
				enable_image_download: '이미지 다운로드 활성화',
				enable_image_download_desc: '이미지를 로컬에 다운로드하고 링크를 업데이트합니다',
				post_import_limit: '포스트 가져오기 제한',
				post_import_limit_desc: '한 번에 가져올 포스트의 최대 개수 (0 = 무제한)',
				subscribed_blogs: '구독 블로그',
				add_blog_id: '블로그 ID 추가',
				add_blog_id_desc: '새 블로그 ID를 입력하고 추가 버튼을 클릭하세요',
				add_button: '추가',
				remove_button: '제거',
				sync_button: '동기화',
				no_subscribed_blogs: '구독한 블로그가 없습니다',
				posts_label: '포스트'
			},
			notices: {
				api_key_required: '{{provider}} API 키가 AI 포맷팅에 필요합니다',
				set_api_key: '플러그인 설정에서 API 키를 설정해주세요',
				no_active_file: '포맷팅할 활성 파일이 선택되지 않았습니다',
				ai_formatting_progress: 'AI 레이아웃 수정 진행 중...',
				content_too_short: 'AI 포맷팅을 위한 내용이 너무 짧습니다 (최소 50자)',
				ai_formatting_failed: 'AI 포맷팅에 실패했습니다. 다시 시도해주세요',
				ai_formatting_success: 'AI가 레이아웃과 포맷을 수정했습니다!',
				invalid_api_key: '잘못된 API 키입니다',
				api_quota_exceeded: 'API 할당량이 초과되었습니다',
				network_error: '네트워크 오류 - 인터넷 연결을 확인해주세요',
				syncing_blog: '블로그 동기화 중 {{progress}}: {{blogId}} ({{postCount}}개 포스트)',
				sync_completed: '동기화 완료: {{successCount}}/{{totalCount}} 포스트',
				subscribed_to: '{{blogId}}를 구독했습니다',
				unsubscribed_from: '{{blogId}} 구독을 해제했습니다',
				blog_already_subscribed: '이미 구독 중인 블로그입니다: {{blogId}}',
				file_already_exists: '파일이 이미 존재합니다: {{filename}}',
				processing_post: '포스트 처리 중: {{title}}',
				post_imported: '포스트 가져오기 완료: {{title}}',
				import_failed: '가져오기 실패: {{error}}',
				downloading_images: '이미지 다운로드 중...',
				image_download_complete: '이미지 다운로드 완료: {{count}}개',
				generating_ai_tags: 'AI 태그 생성 중...',
				generating_ai_excerpt: 'AI 요약 생성 중...',
				post_limit_exceeded: '최대 제한은 1000개 포스트입니다. 값이 1000으로 조정되었습니다.'
			},
			modals: {
				import_single_post: {
					title: 'URL로 단일 포스트 가져오기',
					blog_id_label: '블로그 ID',
					blog_id_placeholder: '예: myblog',
					log_no_label: '포스트 URL 또는 LogNo',
					log_no_placeholder: 'URL 또는 LogNo (예: https://blog.naver.com/yonofbooks/220883239733)',
					import_button: '포스트 가져오기',
					cancel_button: '취소'
				},
				import_blog_url: {
					title: '블로그 전체 포스트 가져오기',
					url_label: '블로그 ID',
					url_placeholder: '예: yonofbooks',
					import_button: '전체 포스트 가져오기',
					cancel_button: '취소'
				},
				subscribe_blog: {
					title: '네이버 블로그 구독하기',
					blog_id_label: '블로그 ID',
					blog_id_desc: '구독할 네이버 블로그 ID를 입력하세요',
					blog_id_placeholder: '블로그 ID',
					subscribe_button: '구독하기'
				}
			},
			errors: {
				invalid_url: '잘못된 URL 형식입니다',
				invalid_blog_id: '잘못된 블로그 ID입니다',
				invalid_log_no: '잘못된 포스트 번호입니다',
				fetch_failed: '포스트 가져오기에 실패했습니다: {{error}}',
				parse_failed: '포스트 파싱에 실패했습니다: {{error}}',
				save_failed: '파일 저장에 실패했습니다: {{error}}',
				ai_error: 'AI 처리 중 오류가 발생했습니다: {{error}}',
				network_timeout: '네트워크 시간 초과',
				unauthorized: '인증되지 않은 요청 - API 키를 확인해주세요',
				rate_limit: '요청 한도 초과 - 잠시 후 다시 시도해주세요'
			},
			providers: {
				openai: 'OpenAI (GPT)',
				anthropic: 'Anthropic (Claude)',
				google: 'Google (Gemini)',
				ollama: 'Ollama (로컬)'
			}
		};
	}
}

interface BlogSubscription {
	blogId: string;
	postCount: number;
}

interface NaverBlogSettings {
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

const DEFAULT_SETTINGS: NaverBlogSettings = {
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
}

interface ProcessedBlogPost extends NaverBlogPost {
	tags: string[];
	excerpt: string;
}

export default class NaverBlogPlugin extends Plugin {
	settings: NaverBlogSettings;
	i18n: I18n;
	
	// Cached API models
	private openai_models: string[] = [];
	private anthropic_models: string[] = [];
	private google_models: string[] = [];

	async onload() {
		await this.loadSettings();
		
		// Initialize translations
		this.i18n = new I18n(this.app);
		// Detect locale from Obsidian's language setting
		const locale = this.detectLocale();
		await this.i18n.loadTranslations(locale);
		
		// Listen for Obsidian language changes
		this.setupLanguageChangeListener();

		// Fetch models from APIs in background
		this.refreshModels().catch(error => {
			console.log('Failed to refresh models on startup:', error);
		});

		// Add ribbon icon
		this.addRibbonIcon('download', 'Import Naver Blog', (evt: MouseEvent) => {
			new NaverBlogImportModal(this.app, this).open();
		});

		// Add commands
		this.addCommand({
			id: 'import-naver-blog',
			name: this.i18n.t('commands.import-blog-url'),
			callback: () => {
				new NaverBlogImportModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'subscribe-naver-blog',
			name: this.i18n.t('commands.sync-subscribed-blogs'),
			callback: () => {
				new NaverBlogSubscribeModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'import-single-post',
			name: this.i18n.t('commands.import-single-post'),
			callback: () => {
				new NaverBlogSinglePostModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'rewrite-current-note',
			name: this.i18n.t('commands.ai-fix-layout'),
			callback: async () => {
				// Check API key first
				const apiKey = this.getApiKey();
				if (!apiKey || apiKey.trim() === '') {
					new Notice(this.i18n.t('notices.api_key_required', { provider: this.settings.aiProvider.toUpperCase() }), 8000);
					new Notice(this.i18n.t('notices.set_api_key'), 5000);
					return;
				}

				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					new Notice(this.i18n.t('notices.no_active_file'));
					return;
				}

				if (!activeFile.path.endsWith('.md')) {
					new Notice('Please select a markdown file');
					return;
				}

				await this.rewriteCurrentNote(activeFile);
			}
		});

		// Auto-sync subscribed blogs on startup
		if (this.settings.subscribedBlogs.length > 0) {
			setTimeout(() => this.syncSubscribedBlogs(), 5000);
		}

		// Add settings tab
		this.addSettingTab(new NaverBlogSettingTab(this.app, this));
	}

	onunload() {
		// Cleanup if needed
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		// Ensure default values are used if folders are empty
		if (!this.settings.defaultFolder || this.settings.defaultFolder.trim() === '') {
			this.settings.defaultFolder = DEFAULT_SETTINGS.defaultFolder;
		}
		if (!this.settings.imageFolder || this.settings.imageFolder.trim() === '') {
			this.settings.imageFolder = DEFAULT_SETTINGS.imageFolder;
		}
		// Validate postImportLimit
		if (this.settings.postImportLimit < 0) {
			this.settings.postImportLimit = DEFAULT_SETTINGS.postImportLimit;
		}
		if (this.settings.postImportLimit > 1000) {
			this.settings.postImportLimit = 1000; // Cap at 1000 posts
		}
		await this.saveData(this.settings);
	}

	async fetchNaverBlogPosts(blogId: string, maxPosts?: number): Promise<ProcessedBlogPost[]> {
		let fetchNotice: Notice | null = null;
		try {
			fetchNotice = new Notice('Fetching blog posts...', 0); // Persistent notice
			
			// Use settings value if maxPosts is not provided and settings value is > 0
			const effectiveMaxPosts = maxPosts || (this.settings.postImportLimit > 0 ? this.settings.postImportLimit : undefined);
			
			const fetcher = new NaverBlogFetcher(blogId);
			const posts = await fetcher.fetchPosts(effectiveMaxPosts);
			
			// Hide the persistent notice
			if (fetchNotice) {
				fetchNotice.hide();
				fetchNotice = null;
			}
			
			// Filter out duplicates if enabled
			let filteredPosts = posts;
			if (this.settings.enableDuplicateCheck) {
				const existingLogNos = await this.getExistingLogNos();
				filteredPosts = posts.filter(post => !existingLogNos.has(post.logNo));
				new Notice(`Found ${posts.length} posts, ${filteredPosts.length} new posts after duplicate check`, 4000);
			} else {
				new Notice(`Found ${posts.length} posts`, 4000);
			}
			
			new Notice(`Processing ${filteredPosts.length} posts...`, 3000);
			
			// Convert to ProcessedBlogPost with empty tags and excerpt
			const processedPosts: ProcessedBlogPost[] = filteredPosts.map(post => ({
				...post,
				title: post.title.replace(/^\[.*?\]\s*/, '').replace(/\s*\[.*?\]$/, '').trim(), // Remove [] brackets from title start/end
				tags: [],
				excerpt: ''
			}));
			
			return processedPosts;
			
		} catch (error) {
			// Hide the persistent notice on error
			if (fetchNotice) {
				fetchNotice.hide();
			}
			console.error('Error fetching blog posts:', error);
			new Notice('Failed to fetch blog posts. Please check the blog ID.');
			return [];
		}
	}

	async callAI(messages: Array<{role: string, content: string}>, maxTokens: number = 150): Promise<string> {
		const apiKey = this.getApiKey();
		if (!apiKey) {
			throw new Error('No API key configured for selected AI provider');
		}

		const model = this.getModelName();
		
		switch (this.settings.aiProvider) {
			case 'openai':
				return await this.callOpenAI(messages, maxTokens, model, apiKey);
			case 'anthropic':
				return await this.callAnthropic(messages, maxTokens, model, apiKey);
			case 'google':
				return await this.callGoogle(messages, maxTokens, model, apiKey);
			case 'ollama':
				return await this.callOllama(messages, maxTokens, model);
			default:
				throw new Error(`Unsupported AI provider: ${this.settings.aiProvider}`);
		}
	}

	private getApiKey(): string {
		switch (this.settings.aiProvider) {
			case 'openai': return this.settings.openaiApiKey;
			case 'anthropic': return this.settings.anthropicApiKey;
			case 'google': return this.settings.googleApiKey;
			case 'ollama': return ''; // Ollama doesn't need API key
			default: return '';
		}
	}

	getModelName(): string {
		if (this.settings.aiModel) {
			return this.settings.aiModel;
		}
		
		return this.getDefaultModelForProvider(this.settings.aiProvider);
	}
	
	getDefaultModelForProvider(provider: 'openai' | 'anthropic' | 'google' | 'ollama'): string {
		// Default models per provider
		switch (provider) {
			case 'openai': return 'gpt-4o-mini';
			case 'anthropic': return 'claude-3-haiku-20240307';
			case 'google': return 'gemini-2.5-flash';
			case 'ollama': return 'llama3.2:3b';
			default: return 'gpt-4o-mini';
		}
	}

	getAvailableModels(): string[] {
		// Return cached models if available, otherwise fallback to static list
		const cacheKey = `${this.settings.aiProvider}_models`;
		const cachedModels = (this as any)[cacheKey];
		
		if (cachedModels && cachedModels.length > 0) {
			return cachedModels;
		}
		
		// Fallback to static models
		return this.getStaticModels();
	}
	
	getStaticModels(): string[] {
		switch (this.settings.aiProvider) {
			case 'openai':
				return [
					'gpt-4o',
					'gpt-4o-mini',
					'gpt-4-turbo',
					'gpt-4',
					'gpt-3.5-turbo',
					'gpt-3.5-turbo-16k',
					'o1-preview',
					'o1-mini'
				];
			case 'anthropic':
				return [
					'claude-3-5-sonnet-20241022',
					'claude-3-5-haiku-20241022',
					'claude-3-opus-20240229',
					'claude-3-sonnet-20240229',
					'claude-3-haiku-20240307'
				];
			case 'google':
				return [
					'gemini-2.5-pro',
					'gemini-2.5-flash',
					'gemini-2.5-flash-lite-preview-06-17',
					'gemini-2.0-flash',
					'gemini-2.0-flash-lite',
					'gemini-1.5-pro',
					'gemini-1.5-pro-002',
					'gemini-1.5-flash',
					'gemini-1.5-flash-002',
					'gemini-1.5-flash-8b',
					'gemini-1.0-pro',
					'gemini-1.0-pro-001',
					'gemini-pro'
				];
			case 'ollama':
				return [
					'llama3.2:3b',
					'llama3.2:1b',
					'llama3.1:8b',
					'mistral:7b',
					'codellama:7b',
					'phi3:mini',
					'qwen2:7b'
				];
			default:
				return ['gpt-4o-mini'];
		}
	}

	async fetchModelsFromAPI(provider: 'openai' | 'anthropic' | 'google'): Promise<string[]> {
		try {
			switch (provider) {
				case 'openai':
					return await this.fetchOpenAIModels();
				case 'anthropic':
					return await this.fetchAnthropicModels();
				case 'google':
					return await this.fetchGoogleModels();
				default:
					return [];
			}
		} catch (error) {
			console.error(`Failed to fetch models from ${provider}:`, error);
			return [];
		}
	}

	async fetchOpenAIModels(): Promise<string[]> {
		const apiKey = this.settings.openaiApiKey;
		if (!apiKey) {
			return [];
		}

		try {
			const response = await requestUrl({
				url: 'https://api.openai.com/v1/models',
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${apiKey}`,
					'Content-Type': 'application/json'
				}
			});

			if (response.status === 200) {
				const models = response.json.data
					.map((model: any) => model.id)
					.filter((id: string) => 
						id.startsWith('gpt-') || 
						id.startsWith('o1-') || 
						id.startsWith('text-davinci') ||
						id.startsWith('text-curie') ||
						id.startsWith('text-babbage') ||
						id.startsWith('text-ada')
					)
					.sort();
				
				console.log(`Fetched ${models.length} OpenAI models`);
				return models;
			}
		} catch (error) {
			console.error('OpenAI models fetch error:', error);
		}
		
		return [];
	}

	async fetchAnthropicModels(): Promise<string[]> {
		const apiKey = this.settings.anthropicApiKey;
		if (!apiKey) {
			return [];
		}

		try {
			const response = await requestUrl({
				url: 'https://api.anthropic.com/v1/models',
				method: 'GET',
				headers: {
					'x-api-key': apiKey,
					'Content-Type': 'application/json',
					'anthropic-version': '2023-06-01'
				}
			});

			if (response.status === 200) {
				const models = response.json.data
					.map((model: any) => model.id)
					.filter((id: string) => id.startsWith('claude-'))
					.sort();
				
				console.log(`Fetched ${models.length} Anthropic models`);
				return models;
			}
		} catch (error) {
			console.error('Anthropic models fetch error:', error);
		}
		
		return [];
	}

	async fetchGoogleModels(): Promise<string[]> {
		const apiKey = this.settings.googleApiKey;
		if (!apiKey) {
			return [];
		}

		try {
			const response = await requestUrl({
				url: `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			});

			if (response.status === 200) {
				const models = response.json.models
					.filter((model: any) => {
						// Check if model supports generateContent
						const supportedMethods = model.supportedGenerationMethods || [];
						const hasGenerateContent = supportedMethods.includes('generateContent');
						
						// More flexible filtering - include all gemini models that support text generation
						const modelName = model.name.toLowerCase();
						const isGeminiModel = modelName.includes('gemini');
						const isTextModel = !modelName.includes('embedding') && 
							!modelName.includes('vision') && 
							!modelName.includes('code') && 
							!modelName.includes('image');
						
						// Debug logging for all models to see what's available
						console.log(`Google model: ${model.name}, supports generateContent: ${hasGenerateContent}, is gemini: ${isGeminiModel}, is text: ${isTextModel}`);
						
						return hasGenerateContent && isGeminiModel && isTextModel;
					})
					.map((model: any) => {
						// Remove 'models/' prefix and return clean model name
						const cleanName = model.name.replace('models/', '');
						return cleanName;
					})
					.sort();
				
				console.log(`Fetched ${models.length} Google models:`, models);
				return models;
			}
		} catch (error) {
			console.error('Google models fetch error:', error);
		}
		
		return [];
	}

	async refreshModels(provider?: 'openai' | 'anthropic' | 'google'): Promise<void> {
		const providersToRefresh = provider ? [provider] : ['openai', 'anthropic', 'google'];
		
		for (const p of providersToRefresh) {
			const models = await this.fetchModelsFromAPI(p as 'openai' | 'anthropic' | 'google');
			if (models.length > 0) {
				const cacheKey = `${p}_models`;
				(this as any)[cacheKey] = models;
			}
		}
	}

	detectLocale(): string {
		// Primary: Use Obsidian's language setting (most reliable)
		const obsidianLang = window.localStorage.getItem('language');
		if (obsidianLang) {
			console.log('Detected Obsidian language:', obsidianLang);
			return obsidianLang;
		}
		
		// Fallback: Use moment.locale() (though unreliable in newer Obsidian versions)
		try {
			const momentLang = (window as any).moment?.locale();
			if (momentLang) {
				console.log('Detected moment language:', momentLang);
				return momentLang;
			}
		} catch (e) {
			// Ignore moment errors
		}
		
		// Final fallback: Use system locale
		if (navigator.language.startsWith('ko') || 
		    navigator.languages.some(lang => lang.startsWith('ko')) ||
		    Intl.DateTimeFormat().resolvedOptions().locale.startsWith('ko')) {
			console.log('Detected system language: ko');
			return 'ko';
		}
		
		console.log('Defaulting to language: en');
		return 'en';
	}

	setupLanguageChangeListener(): void {
		// Listen for localStorage changes (when user changes language in Obsidian)
		const handleStorageChange = async (event: StorageEvent) => {
			if (event.key === 'language' && event.newValue !== event.oldValue) {
				console.log('Obsidian language changed to:', event.newValue);
				
				// Reload translations with new language
				const newLocale = event.newValue || 'en';
				await this.i18n.loadTranslations(newLocale);
				
				// Refresh UI elements if settings tab is open
				const settingsTab = (this.app as any).setting?.activeTab;
				if (settingsTab && settingsTab.id === 'naver-blog-importer') {
					// Refresh the settings display
					(settingsTab as any).display?.();
				}
			}
		};
		
		window.addEventListener('storage', handleStorageChange);
		
		// Clean up listener on unload
		this.register(() => {
			window.removeEventListener('storage', handleStorageChange);
		});
	}

	private async callOpenAI(messages: Array<{role: string, content: string}>, maxTokens: number, model: string, apiKey: string): Promise<string> {
		const response = await requestUrl({
			url: 'https://api.openai.com/v1/chat/completions',
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: model,
				messages: messages,
				max_tokens: maxTokens,
				temperature: 0.3
			})
		});

		if (response.status === 200) {
			return response.json.choices[0].message.content.trim();
		} else {
			throw new Error(`OpenAI API error: ${response.status}`);
		}
	}

	private async callAnthropic(messages: Array<{role: string, content: string}>, maxTokens: number, model: string, apiKey: string): Promise<string> {
		// Convert messages format for Claude
		const systemMessage = messages.find(m => m.role === 'system')?.content || '';
		const userMessages = messages.filter(m => m.role !== 'system');
		
		const response = await requestUrl({
			url: 'https://api.anthropic.com/v1/messages',
			method: 'POST',
			headers: {
				'x-api-key': apiKey,
				'Content-Type': 'application/json',
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: model,
				max_tokens: maxTokens,
				system: systemMessage,
				messages: userMessages
			})
		});

		if (response.status === 200) {
			return response.json.content[0].text.trim();
		} else {
			throw new Error(`Anthropic API error: ${response.status}`);
		}
	}

	private async callGoogle(messages: Array<{role: string, content: string}>, maxTokens: number, model: string, apiKey: string): Promise<string> {
		// Convert messages format for Gemini
		const contents = messages.map(m => ({
			role: m.role === 'assistant' ? 'model' : 'user',
			parts: [{ text: m.content }]
		}));

		// Retry logic for 503 errors
		const maxRetries = 3;
		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const response = await requestUrl({
					url: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						contents: contents,
						generationConfig: {
							maxOutputTokens: maxTokens,
							temperature: 0.3
						},
						systemInstruction: {
							parts: [{ text: "You are a helpful assistant. Respond directly and concisely without showing your thinking process or reasoning. Give only the final answer." }]
						}
					})
				});

				if (response.status === 200) {
					const data = response.json;
					
					// Debug log the full response
					console.log('Google API full response:', JSON.stringify(data, null, 2));
					
					// Check if response has candidates
					if (!data.candidates || data.candidates.length === 0) {
						console.error('Google API response missing candidates:', data);
						throw new Error('Google API response missing candidates');
					}
					
					const candidate = data.candidates[0];
					console.log('Google API candidate:', JSON.stringify(candidate, null, 2));
					
					// Check if candidate has content
					if (!candidate.content) {
						console.error('Google API candidate missing content:', candidate);
						throw new Error('Google API candidate missing content');
					}
					
					// Handle MAX_TOKENS finish reason - response may be incomplete
					if (candidate.finishReason === 'MAX_TOKENS') {
						console.warn('Google API response was truncated due to MAX_TOKENS');
						if (!candidate.content.parts || candidate.content.parts.length === 0) {
							console.error('Google API response completely truncated - no usable content');
							throw new Error('Google API response completely truncated - try increasing maxTokens or reducing input size');
						}
					}
					
					if (!candidate.content.parts || candidate.content.parts.length === 0) {
						console.error('Google API candidate content missing parts:', candidate.content);
						throw new Error('Google API candidate content missing parts');
					}
					
					const text = candidate.content.parts[0].text;
					if (!text) {
						console.error('Google API content missing text:', candidate.content.parts[0]);
						throw new Error('Google API content missing text');
					}
					
					return text.trim();
				} else if (response.status === 503 && attempt < maxRetries) {
					// 503 Service Unavailable - retry with exponential backoff
					const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
					console.warn(`Google API 503 error, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
					// Show retry notice
					const retryNotice = new Notice(`API 서버 과부하, ${delay/1000}초 후 재시도... (${attempt}/${maxRetries})`, delay);
					await new Promise(resolve => setTimeout(resolve, delay));
					continue;
				} else {
					console.error('Google API error:', response.status, response.text);
					throw new Error(`Google API error: ${response.status} - ${response.text}`);
				}
			} catch (error) {
				if (attempt === maxRetries) {
					throw error;
				}
				console.warn(`Google API request failed (attempt ${attempt}/${maxRetries}):`, error);
				// Wait before retrying
				await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
			}
		}
		
		throw new Error('Google API: Maximum retries exceeded');
	}

	private async callOllama(messages: Array<{role: string, content: string}>, maxTokens: number, model: string): Promise<string> {
		const response = await requestUrl({
			url: `${this.settings.ollamaEndpoint}/api/chat`,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: model,
				messages: messages,
				stream: false,
				options: {
					num_predict: maxTokens,
					temperature: 0.3
				}
			})
		});

		if (response.status === 200) {
			return response.json.message.content.trim();
		} else {
			throw new Error(`Ollama API error: ${response.status}`);
		}
	}

	async generateAITags(title: string, content: string): Promise<string[]> {
		if (!this.settings.enableAiTags) {
			return [];
		}

		// Show progress notice
		const notice = new Notice(this.i18n.t('notices.generating_ai_tags'), 0);
		
		try {
			const messages = [
				{
					role: 'user',
					content: `다음 블로그 글에 적합한 한국어 태그 3-7개를 JSON 배열로 생성해주세요.

제목: ${title}
내용: ${content.substring(0, 800)}

JSON 배열로만 응답하세요. 예: ["리뷰", "기술", "일상"]`
				}
			];

			// Use higher maxTokens for Pro models due to thinking mode
			const maxTokens = this.settings.aiModel.includes('pro') ? 10000 : 4000;
			const content_text = await this.callAI(messages, maxTokens);
			
			try {
				// Remove markdown code blocks if present
				let cleanedText = content_text;
				if (cleanedText.includes('```json')) {
					cleanedText = cleanedText.replace(/```json\n?/, '').replace(/\n?```$/, '');
				}
				if (cleanedText.includes('```')) {
					cleanedText = cleanedText.replace(/```\n?/, '').replace(/\n?```$/, '');
				}
				
				const tags = JSON.parse(cleanedText.trim());
				return Array.isArray(tags) ? tags : [];
			} catch (parseError) {
				console.warn('Failed to parse tags as JSON:', content_text);
				// Fallback parsing - extract array from text
				const matches = content_text.match(/\[(.*?)\]/s);
				if (matches) {
					try {
						// Try to parse the matched content as JSON
						const arrayContent = '[' + matches[1] + ']';
						const tags = JSON.parse(arrayContent);
						return Array.isArray(tags) ? tags : [];
					} catch (e) {
						// Manual parsing if JSON fails
						return matches[1].split(',').map((tag: string) => tag.trim().replace(/["\n]/g, ''));
					}
				}
				return [];
			}
		} catch (error) {
			console.error('Error generating AI tags:', error);
			return [];
		} finally {
			notice.hide();
		}
	}

	async generateAIExcerpt(title: string, content: string): Promise<string> {
		if (!this.settings.enableAiExcerpt) {
			return '';
		}

		// Show progress notice
		const notice = new Notice(this.i18n.t('notices.generating_ai_excerpt'), 0);
		
		try {
			const messages = [
				{
					role: 'user',
					content: `다음 블로그 글을 1-2문장으로 요약해주세요.

제목: ${title}
내용: ${content.substring(0, 500)}

한국어로 간결하게 요약하고, 따옴표 없이 본문만 응답하세요.`
				}
			];

			// Use higher maxTokens for Pro models due to thinking mode
			const maxTokens = this.settings.aiModel.includes('pro') ? 10000 : 4000;
			return await this.callAI(messages, maxTokens);
		} catch (error) {
			console.error('Error generating AI excerpt:', error);
			return '';
		} finally {
			notice.hide();
		}
	}

	async createMarkdownFile(post: ProcessedBlogPost): Promise<void> {
		try {
			// Generate AI tags and excerpt if enabled
			if (this.settings.enableAiTags) {
				post.tags = await this.generateAITags(post.title, post.content);
			}
			
			if (this.settings.enableAiExcerpt) {
				// Add small delay between AI calls to avoid rate limiting
				if (this.settings.enableAiTags) {
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
				post.excerpt = await this.generateAIExcerpt(post.title, post.content);
			}

			// Process images if enabled
			let processedContent = post.content;
			if (this.settings.enableImageDownload) {
				processedContent = await this.downloadAndProcessImages(post.content, post.logNo);
			}

			// Create filename - just title.md without date prefix and hyphen replacements
			const filename = this.sanitizeFilename(`${post.title}.md`);
			const folder = this.settings.defaultFolder || DEFAULT_SETTINGS.defaultFolder;
			
			// Ensure folder exists
			if (!await this.app.vault.adapter.exists(folder)) {
				await this.app.vault.createFolder(folder);
			}
			
			const filepath = `${folder}/${filename}`;

			// Create frontmatter
			const frontmatter = this.createFrontmatter(post);
			
			// Create full content
			const fullContent = `${frontmatter}\n${processedContent}`;

			// Check if file already exists
			if (await this.app.vault.adapter.exists(filepath)) {
				console.log(`File already exists: ${filename}`);
				return;
			}
			
			// Create the file
			await this.app.vault.create(filepath, fullContent);
			
			new Notice(`Created: ${filename}`);
		} catch (error) {
			console.error('Error creating markdown file:', error);
			new Notice(`Failed to create file for: ${post.title}`);
		}
	}

	createFrontmatter(post: ProcessedBlogPost): string {
		const tags = post.tags.length > 0 ? post.tags.map(tag => `"${tag}"`).join(', ') : '';
		const excerpt = post.excerpt ? `"${post.excerpt.replace(/"/g, '\\"')}"` : '""';
		
		return `---
title: "${post.title}"
filename: "${post.date}-${this.sanitizeFilename(post.title)}"
date: ${post.date}
share: true
categories: [IT, 개발, 생활]
tags: [${tags}]
excerpt: ${excerpt}
source: "네이버 블로그"
url: "${post.url}"
logNo: "${post.logNo}"
---`;
	}

	async downloadAndProcessImages(content: string, logNo: string): Promise<string> {
		if (!this.settings.enableImageDownload) {
			return content;
		}

		try {
			// Create attachments folder
			const attachmentsFolder = this.settings.imageFolder || DEFAULT_SETTINGS.imageFolder;
			if (!await this.app.vault.adapter.exists(attachmentsFolder)) {
				await this.app.vault.createFolder(attachmentsFolder);
			}

			// Find all image markdown patterns - filter out unwanted images
			const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
			let processedContent = content;
			let match;
			let imageCount = 0;
			const allMatches = [...content.matchAll(new RegExp(imageRegex.source, 'g'))];
			
			// Filter out unwanted images (GIFs, animations, editor assets)
			const filteredMatches = allMatches.filter(([_, altText, imageUrl]) => {
				return this.shouldDownloadImage(imageUrl, altText);
			});
			
			const totalImages = filteredMatches.length;

			if (totalImages > 0) {
				console.log(`Found ${totalImages} valid images to download for post ${logNo} (filtered from ${allMatches.length})`);
			}

			// Process only filtered images
			for (let i = 0; i < filteredMatches.length; i++) {
				const [fullMatch, altText, imageUrl] = filteredMatches[i];
				
				// Skip if already a local path
				if (imageUrl.startsWith('attachments/') || imageUrl.startsWith('./') || imageUrl.startsWith('../')) {
					continue;
				}

				try {
					// Convert Naver CDN URLs to direct URLs
					let directUrl = this.convertToDirectImageUrl(imageUrl);
					const imageProgress = `(${imageCount + 1}/${totalImages})`;
					
					console.log(`Processing image ${imageProgress}: ${imageUrl} -> ${directUrl}`);
					new Notice(`Downloading image ${imageProgress} for post ${logNo}`, 2000);
					
					// Download image
					const response = await requestUrl({
						url: directUrl,
						method: 'GET',
						headers: {
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
						}
					});

					if (response.status === 200 && response.arrayBuffer) {
						// Generate filename from original URL (better for Korean filenames)
						const originalUrlParts = imageUrl.split('/');
						let filename = originalUrlParts[originalUrlParts.length - 1];
						
						// Clean filename and add extension if missing
						filename = filename.split('?')[0]; // Remove query params
						
						// Decode URL-encoded Korean characters
						try {
							filename = decodeURIComponent(filename);
						} catch (e) {
							console.log('Could not decode filename, using as-is');
						}
						
						// If filename is too long or problematic, use a simpler name
						if (filename.length > 100 || !filename.includes('.')) {
							const extension = filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[1] || 'jpg';
							filename = `image_${Date.now()}.${extension}`;
						}
						
						// Add logNo prefix to avoid conflicts
						filename = `${logNo}_${imageCount}_${filename}`;
						filename = this.sanitizeFilename(filename);
						
						console.log(`Generated filename: ${filename}`);
						
						// Save image
						const imagePath = `${attachmentsFolder}/${filename}`;
						try {
							await this.app.vault.adapter.writeBinary(imagePath, response.arrayBuffer);
							
							// Verify file was saved
							const fileExists = await this.app.vault.adapter.exists(imagePath);
							console.log(`File saved successfully: ${fileExists} at ${imagePath}`);
							
							if (!fileExists) {
								throw new Error('File was not saved properly');
							}
						} catch (saveError) {
							console.error(`Failed to save image file: ${saveError}`);
							throw saveError;
						}
						
						// Update content with local path (relative to default folder)
						const defaultFolderPath = this.settings.defaultFolder || DEFAULT_SETTINGS.defaultFolder;
						const imageFolderPath = this.settings.imageFolder || DEFAULT_SETTINGS.imageFolder;
						
						// Calculate relative path from default folder to image folder
						let relativePath = '';
						if (imageFolderPath.startsWith(defaultFolderPath)) {
							// Image folder is inside default folder
							relativePath = imageFolderPath.substring(defaultFolderPath.length + 1);
							if (relativePath) {
								relativePath = relativePath + '/';
							}
						} else {
							// Image folder is outside default folder, use relative path
							const defaultParts = defaultFolderPath.split('/');
							const imageParts = imageFolderPath.split('/');
							
							// Find common prefix
							let commonIndex = 0;
							while (commonIndex < defaultParts.length && 
								   commonIndex < imageParts.length && 
								   defaultParts[commonIndex] === imageParts[commonIndex]) {
								commonIndex++;
							}
							
							// Go up from default folder
							const upLevels = defaultParts.length - commonIndex;
							const upPath = '../'.repeat(upLevels);
							
							// Go down to image folder
							const downPath = imageParts.slice(commonIndex).join('/');
							
							relativePath = upPath + (downPath ? downPath + '/' : '');
						}
						
						const localImagePath = `${relativePath}${filename}`;
						const newImageMd = `![${altText}](${localImagePath})`;
						
						// Clean the original image URL from query parameters before replacing
						const cleanOriginalUrl = imageUrl.split('?')[0];
						processedContent = processedContent.replace(fullMatch, newImageMd);
						
						console.log(`Updated markdown: ${fullMatch} -> ${newImageMd}`);
						
						imageCount++;
						console.log(`✓ Downloaded image ${imageProgress}: ${filename}`);
					} else {
						console.log(`✗ Failed to download image ${imageProgress}: ${directUrl} (Status: ${response.status})`);
						console.log(`Response headers:`, response.headers);
					}
				} catch (imageError) {
					const imageProgress = `(${imageCount + 1}/${totalImages})`;
					let directUrl = this.convertToDirectImageUrl(imageUrl);
					console.error(`✗ Error downloading image ${imageProgress} ${imageUrl}:`, imageError);
					console.log(`Direct URL attempted: ${directUrl}`);
					
					// Try alternative download method for postfiles.pstatic.net
					if (imageUrl.includes('postfiles.pstatic.net')) {
						console.log(`Trying alternative method for postfiles.pstatic.net...`);
						try {
							const altResponse = await requestUrl({
								url: imageUrl, // Use original URL
								method: 'GET',
								headers: {
									'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
									'Referer': 'https://blog.naver.com/'
								}
							});
							
							if (altResponse.status === 200 && altResponse.arrayBuffer) {
								console.log(`✓ Alternative download successful for ${imageUrl}`);
								// Use same filename logic as above
								const urlParts = imageUrl.split('/');
								let filename = urlParts[urlParts.length - 1];
								filename = filename.split('?')[0];
								if (!filename.includes('.')) {
									filename += '.jpg';
								}
								filename = `${logNo}_${imageCount}_${filename}`;
								filename = this.sanitizeFilename(filename);
								
								const imagePath = `${attachmentsFolder}/${filename}`;
								await this.app.vault.adapter.writeBinary(imagePath, altResponse.arrayBuffer);
								
								const defaultFolderPath = this.settings.defaultFolder || DEFAULT_SETTINGS.defaultFolder;
								const imageFolderPath = this.settings.imageFolder || DEFAULT_SETTINGS.imageFolder;
								let relativePath = '';
								if (imageFolderPath.startsWith(defaultFolderPath)) {
									relativePath = imageFolderPath.substring(defaultFolderPath.length + 1);
									if (relativePath) {
										relativePath = relativePath + '/';
									}
								} else {
									const defaultParts = defaultFolderPath.split('/');
									const imageParts = imageFolderPath.split('/');
									let commonIndex = 0;
									while (commonIndex < defaultParts.length && 
										   commonIndex < imageParts.length && 
										   defaultParts[commonIndex] === imageParts[commonIndex]) {
										commonIndex++;
									}
									const upLevels = defaultParts.length - commonIndex;
									const upPath = '../'.repeat(upLevels);
									const downPath = imageParts.slice(commonIndex).join('/');
									relativePath = upPath + (downPath ? downPath + '/' : '');
								}
								
								const localImagePath = `${relativePath}${filename}`;
								const newImageMd = `![${altText}](${localImagePath})`;
								processedContent = processedContent.replace(fullMatch, newImageMd);
								imageCount++;
								console.log(`✓ Downloaded image via alternative method ${imageProgress}: ${filename}`);
							}
						} catch (altError) {
							console.error(`Alternative download also failed:`, altError);
						}
					}
				}
			}

			return processedContent;
		} catch (error) {
			console.error('Error processing images:', error);
			return content; // Return original content on error
		}
	}

	async rewriteCurrentNote(file: TFile): Promise<void> {
		try {
			new Notice('🤖 AI layout fixing in progress...', 5000);
			
			// Read the current file content
			const content = await this.app.vault.read(file);
			
			// Extract frontmatter and body
			const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
			let frontmatter = '';
			let body = content;
			
			if (frontmatterMatch) {
				frontmatter = frontmatterMatch[1];
				body = frontmatterMatch[2];
			}
			
			// Clean the body content for AI processing (remove markdown syntax temporarily)
			const cleanBody = body
				.replace(/!\[([^\]]*)\]\([^)]*\)/g, '[이미지: $1]') // Replace images with placeholders
				.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Remove links but keep text
				.replace(/[#*`]/g, '') // Remove markdown formatting
				.trim();
			
			if (!cleanBody || cleanBody.length < 50) {
				new Notice('Content too short for AI formatting (minimum 50 characters)');
				return;
			}

			// Call AI for layout fixing
			const fixedContent = await this.callAIForLayoutFix(cleanBody);
			
			if (!fixedContent) {
				new Notice('❌ AI formatting failed. Please try again.');
				return;
			}

			// Reconstruct the file with fixed content
			let newContent = '';
			if (frontmatter) {
				newContent = `---\n${frontmatter}\n---\n\n${fixedContent}`;
			} else {
				newContent = fixedContent;
			}

			// Write the fixed content back to the file
			await this.app.vault.modify(file, newContent);
			
			new Notice('✅ Layout and formatting fixed by AI!', 5000);
			
		} catch (error) {
			console.error('AI layout fix error:', error);
			
			// Provide specific error messages
			if (error.message.includes('401')) {
				new Notice('❌ Invalid OpenAI API Key', 8000);
				new Notice('💡 Please check your API key in plugin settings', 5000);
			} else if (error.message.includes('quota')) {
				new Notice('❌ OpenAI API quota exceeded', 8000);
				new Notice('💡 Please check your OpenAI billing settings', 5000);
			} else if (error.message.includes('network')) {
				new Notice('❌ Network error - please check your connection', 5000);
			} else {
				new Notice(`❌ AI formatting failed: ${error.message}`, 8000);
			}
		}
	}

	async callAIForLayoutFix(content: string): Promise<string> {
		try {
			const messages = [
				{
					role: 'user',
					content: `다음은 네이버 블로그에서 HTML 파싱으로 가져온 텍스트입니다. HTML 파싱 과정에서 레이아웃이 깨지고 형식이 망가진 부분을 수정해주세요.

⚠️ **중요**: 원문의 내용은 100% 그대로 유지하고, 오직 마크다운 형식과 레이아웃만 수정해주세요.

**수정 사항**:
1. 줄바꿈과 문단 구분을 자연스럽게 정리
2. 제목이 필요한 부분에 적절한 ## 또는 ### 추가  
3. 목록 형태의 내용은 - 또는 1. 형식으로 정리
4. 강조가 필요한 부분만 **볼드** 처리
5. 전체적인 마크다운 형식 정리

**절대 하지 말 것**:
- 내용 추가, 삭제, 변경 금지
- 의미나 뉘앙스 변경 금지  
- 새로운 정보나 해석 추가 금지

원문:
${content}

위 내용의 형식만 깔끔하게 수정해서 마크다운으로 출력해주세요.`
				}
			];

			let fixedContent = await this.callAI(messages, 4000);
			
			// Remove markdown code block wrappers if present
			if (fixedContent.startsWith('```markdown\n') && fixedContent.endsWith('\n```')) {
				fixedContent = fixedContent.substring(12, fixedContent.length - 4).trim();
			} else if (fixedContent.startsWith('```\n') && fixedContent.endsWith('\n```')) {
				fixedContent = fixedContent.substring(4, fixedContent.length - 4).trim();
			}
			
			return fixedContent;
			
		} catch (error) {
			console.error('AI formatting call failed:', error);
			
			// Re-throw with more specific error types
			if (error.message.includes('401') || error.message.includes('Invalid')) {
				throw new Error(`Invalid API key. Please check your ${this.settings.aiProvider.toUpperCase()} API key in settings.`);
			} else if (error.message.includes('quota') || error.message.includes('billing')) {
				throw new Error(`API quota exceeded. Please check your ${this.settings.aiProvider.toUpperCase()} billing.`);
			} else if (error.message.includes('network') || error.message.includes('fetch')) {
				throw new Error('Network error. Please check your internet connection.');
			} else {
				throw error;
			}
		}
	}

	convertToDirectImageUrl(url: string): string {
		// Convert Naver blog image URLs to direct download URLs - improved logic
		let directUrl = url;
		
		// For postfiles.pstatic.net, keep the original URL but without query params
		if (directUrl.includes('postfiles.pstatic.net')) {
			// Remove only size-related query parameters, keep the URL structure
			directUrl = directUrl.replace(/\?type=w\d+/i, '').replace(/&type=w\d+/i, '');
			console.log(`Postfiles URL cleaned: ${url} -> ${directUrl}`);
			return directUrl;
		}
		
		// Remove query parameters for other domains
		directUrl = directUrl.split('?')[0];
		
		// Convert various Naver CDN formats to direct download URLs
		directUrl = directUrl
			.replace('https://mblogvideo-phinf.pstatic.net/', 'https://blogfiles.pstatic.net/') // video CDN
			.replace('https://mblogthumb-phinf.pstatic.net/', 'https://blogfiles.pstatic.net/') // thumbnail CDN
			.replace('https://blogpfthumb-phinf.pstatic.net/', 'https://blogfiles.pstatic.net/') // profile thumb CDN
			.replace('/MjAxOA%3D%3D/', '/MjAxOA==/')  // URL decode some patterns
			.replace('/MjAxOQ%3D%3D/', '/MjAxOQ==/')
			.replace('/MjAyMA%3D%3D/', '/MjAyMA==/')
			.replace('/MjAyMQ%3D%3D/', '/MjAyMQ==/')
			.replace('/MjAyMg%3D%3D/', '/MjAyMg==/')
			.replace('/MjAyMw%3D%3D/', '/MjAyMw==/')
			.replace('/MjAyNA%3D%3D/', '/MjAyNA==/')
			.replace('/MjAyNQ%3D%3D/', '/MjAyNQ==/'); // 2025 added
		
		console.log(`URL conversion: ${url} -> ${directUrl}`);
		return directUrl;
	}

	shouldDownloadImage(imageUrl: string, altText: string): boolean {
		// Skip common Naver blog editor assets and animations
		const skipPatterns = [
			// Naver blog editor assets
			/se-sticker/i,
			/se-emoticon/i,
			/editor/i,
			/naverblog_pc/i,
			
			// Common animation and GIF patterns
			/\.gif$/i,
			/loading/i,
			/spinner/i,
			/animation/i,
			/thumb/i,
			
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
		];
		
		// Check URL patterns
		for (const pattern of skipPatterns) {
			if (pattern.test(imageUrl)) {
				console.log(`Skipping UI/animation image: ${imageUrl}`);
				return false;
			}
		}
		
		// Check alt text patterns
		if (altText) {
			const altSkipPatterns = [
				/이모티콘/i,
				/스티커/i,
				/애니메이션/i,
				/로딩/i,
				/아이콘/i,
				/profile/i,
				/background/i,
				/프로필/i,
				/배경/i
			];
			
			for (const pattern of altSkipPatterns) {
				if (pattern.test(altText)) {
					console.log(`Skipping image by alt text: ${altText}`);
					return false;
				}
			}
		}
		
		// Check if URL looks like a thumbnail (contains size parameters)
		const thumbnailPattern = /[?&](w|h|width|height)=\d+/i;
		if (thumbnailPattern.test(imageUrl)) {
			console.log(`Skipping thumbnail image: ${imageUrl}`);
			return false;
		}
		
		// Skip ssl.pstatic.net profile images specifically
		if (imageUrl.includes('ssl.pstatic.net/static/blog/profile/')) {
			console.log(`Skipping ssl.pstatic.net profile image: ${imageUrl}`);
			return false;
		}
		
		// Only download images from Naver CDN or direct image URLs
		const validDomains = [
			'blogfiles.pstatic.net',
			'postfiles.pstatic.net',
			'mblogthumb-phinf.pstatic.net',
			'blogpfthumb-phinf.pstatic.net'
		];
		
		const isValidDomain = validDomains.some(domain => imageUrl.includes(domain));
		if (!isValidDomain && !imageUrl.match(/\.(jpg|jpeg|png|webp)(\?|$)/i)) {
			console.log(`Skipping non-image URL: ${imageUrl}`);
			return false;
		}
		
		return true;
	}

	sanitizeFilename(filename: string): string {
		return filename
			.replace(/\[.*?\]/g, '') // Remove [] brackets
			.replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
			.replace(/^\s+|\s+$/g, '') // Trim spaces
			.substring(0, 100); // Limit length but keep spaces
	}

	async getExistingLogNos(): Promise<Set<string>> {
		const existingLogNos = new Set<string>();
		try {
			const files = this.app.vault.getMarkdownFiles();
			for (const file of files) {
				const content = await this.app.vault.read(file);
				const logNoMatch = content.match(/logNo: "([^"]+)"/i);
				if (logNoMatch) {
					existingLogNos.add(logNoMatch[1]);
				}
			}
		} catch (error) {
			console.error('Error reading existing logNos:', error);
		}
		return existingLogNos;
	}

	async syncSubscribedBlogs(): Promise<void> {
		if (this.settings.subscribedBlogs.length === 0) return;
		
		const syncNotice = new Notice('Syncing subscribed blogs...', 0); // Persistent notice
		let totalNewPosts = 0;
		let totalErrors = 0;
		const totalBlogs = this.settings.subscribedBlogs.length;
		
		try {
			for (let i = 0; i < this.settings.subscribedBlogs.length; i++) {
				const blogId = this.settings.subscribedBlogs[i];
				const blogProgress = `(${i + 1}/${totalBlogs})`;
				
				// Get blog-specific post count or use default
				const blogSubscription = this.settings.blogSubscriptions.find(sub => sub.blogId === blogId);
				const postCount = blogSubscription?.postCount || 10;
				
				try {
					new Notice(`Syncing blog ${blogProgress}: ${blogId} (${postCount} posts)`, 5000);
					const posts = await this.fetchNaverBlogPosts(blogId, postCount);
					
					let blogSuccessCount = 0;
					let blogErrorLogCount = 0;
					let blogErrorCount = 0;
					
					for (let j = 0; j < posts.length; j++) {
						const post = posts[j];
						const postProgress = `${blogProgress} post (${j + 1}/${posts.length})`;
						const isErrorPost = post.title.startsWith('[오류]');
						
						try {
							new Notice(`Creating ${postProgress}: ${post.title}`, 3000);
							await this.createMarkdownFile(post);
							
							if (isErrorPost) {
								blogErrorLogCount++;
							} else {
								blogSuccessCount++;
							}
							totalNewPosts++;
						} catch (error) {
							console.error(`Error creating file for post ${post.logNo} from ${blogId} ${postProgress}:`, error);
							blogErrorCount++;
							totalErrors++;
						}
						await new Promise(resolve => setTimeout(resolve, 500));
					}
					
					console.log(`Blog ${blogId}: ${blogSuccessCount} success, ${blogErrorLogCount} error logs, ${blogErrorCount} errors`);
				} catch (error) {
					console.error(`Error syncing blog ${blogId} ${blogProgress}:`, error);
					totalErrors++;
				}
			}
		} finally {
			// Always hide the persistent notice
			syncNotice.hide();
		}
		
		new Notice(`Sync complete: ${totalNewPosts} new posts imported, ${totalErrors} errors`);
	}
}

class NaverBlogImportModal extends Modal {
	plugin: NaverBlogPlugin;
	blogId: string = '';

	constructor(app: App, plugin: NaverBlogPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: this.plugin.i18n.t('modals.import_blog_url.title') });

		let inputElement: HTMLInputElement;

		new Setting(contentEl)
			.setName(this.plugin.i18n.t('modals.import_blog_url.url_label'))
			.setDesc(this.plugin.i18n.t('modals.import_blog_url.url_placeholder'))
			.addText(text => {
				inputElement = text.inputEl;
				text.setPlaceholder(this.plugin.i18n.t('modals.import_blog_url.url_label'))
					.setValue(this.blogId)
					.onChange(async (value) => {
						this.blogId = value;
					});
				
				// Add enter key event listener
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						this.handleImport();
					}
				});
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText(this.plugin.i18n.t('modals.import_blog_url.import_button'))
				.setCta()
				.onClick(async () => {
					this.handleImport();
				}));

		// Focus on input when modal opens
		setTimeout(() => {
			if (inputElement) {
				inputElement.focus();
			}
		}, 100);
	}

	async handleImport() {
		if (!this.blogId.trim()) {
			new Notice("Please enter a blog ID");
			return;
		}
		
		// Close modal immediately
		this.close();
		
		// Start import in background
		this.importPosts();
	}

	async importPosts() {
		let importCancelled = false;
		const cancelNotice = new Notice("Click here to cancel import", 0);
		cancelNotice.noticeEl.addEventListener('click', () => {
			importCancelled = true;
			cancelNotice.hide();
			new Notice("Import cancelled by user", 5000);
		});

		try {
			new Notice("Starting import...");
			
			const posts = await this.plugin.fetchNaverBlogPosts(this.blogId);
			
			if (posts.length === 0) {
				cancelNotice.hide();
				new Notice("No posts found or failed to fetch posts");
				return;
			}

			let successCount = 0;
			let errorCount = 0;
			let errorLogCount = 0;
			const totalPosts = posts.length;
			
			for (let i = 0; i < posts.length; i++) {
				if (importCancelled) {
					console.log(`Import cancelled at ${i}/${totalPosts}`);
					break;
				}

				const post = posts[i];
				const progress = `(${i + 1}/${totalPosts})`;
				const isErrorPost = post.title.startsWith('[오류]');
				
				try {
					new Notice(`Creating file ${progress}: ${post.title}`, 3000);
					await this.plugin.createMarkdownFile(post);
					
					if (isErrorPost) {
						errorLogCount++;
						console.log(`📝 Created error log ${progress}: ${post.title}`);
					} else {
						successCount++;
						console.log(`✓ Created file ${progress}: ${post.title}`);
					}
				} catch (error) {
					console.error(`✗ Error creating file for post ${post.logNo} ${progress}:`, error);
					errorCount++;
				}
				// Add small delay to avoid overwhelming the API
				await new Promise(resolve => setTimeout(resolve, 500));
			}
			
			cancelNotice.hide();
			
			let summary = importCancelled ? 
				`Import cancelled: ${successCount} successful` : 
				`Import complete: ${successCount} successful`;
			
			if (errorLogCount > 0) {
				summary += `, ${errorLogCount} error logs created`;
			}
			
			if (errorCount > 0) {
				summary += `, ${errorCount} file creation errors`;
			}
			
			const processed = successCount + errorLogCount + errorCount;
			summary += ` (${processed}/${totalPosts} processed)`;
			
			if (errorLogCount > 0 || errorCount > 0) {
				summary += ` ⚠️`;
			} else if (!importCancelled) {
				summary += ` ✅`;
			}
			
			new Notice(summary, 8000);
		} catch (error) {
			cancelNotice.hide();
			console.error('Import error:', error);
			new Notice("Import failed. Please check the console for details.");
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class NaverBlogSubscribeModal extends Modal {
	plugin: NaverBlogPlugin;
	blogId: string = '';

	constructor(app: App, plugin: NaverBlogPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: this.plugin.i18n.t('modals.subscribe_blog.title') });

		let inputElement: HTMLInputElement;

		new Setting(contentEl)
			.setName(this.plugin.i18n.t('modals.subscribe_blog.blog_id_label'))
			.setDesc(this.plugin.i18n.t('modals.subscribe_blog.blog_id_desc'))
			.addText(text => {
				inputElement = text.inputEl;
				text.setPlaceholder(this.plugin.i18n.t('modals.subscribe_blog.blog_id_placeholder'))
					.setValue(this.blogId)
					.onChange(async (value) => {
						this.blogId = value;
					});
				
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						this.handleSubscribe();
					}
				});
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText(this.plugin.i18n.t('modals.subscribe_blog.subscribe_button'))
				.setCta()
				.onClick(async () => {
					this.handleSubscribe();
				}));

		setTimeout(() => {
			if (inputElement) {
				inputElement.focus();
			}
		}, 100);
	}

	async handleSubscribe() {
		if (!this.blogId.trim()) {
			new Notice("Please enter a blog ID");
			return;
		}
		
		if (this.plugin.settings.subscribedBlogs.includes(this.blogId)) {
			new Notice("Already subscribed to this blog");
			return;
		}
		
		this.plugin.settings.subscribedBlogs.push(this.blogId);
		
		// Initialize blog subscription with default count
		this.plugin.settings.blogSubscriptions.push({
			blogId: this.blogId,
			postCount: 10
		});
		
		await this.plugin.saveSettings();
		
		new Notice(`Subscribed to ${this.blogId}`);
		this.close();
		
		// Immediately sync the new subscription
		this.plugin.syncSubscribedBlogs();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class NaverBlogSettingTab extends PluginSettingTab {
	plugin: NaverBlogPlugin;

	constructor(app: App, plugin: NaverBlogPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: this.plugin.i18n.t('settings.title') });

		containerEl.createEl('h3', { text: this.plugin.i18n.t('settings.ai_configuration') });

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.ai_provider'))
			.setDesc(this.plugin.i18n.t('settings.ai_provider_desc'))
			.addDropdown(dropdown => dropdown
				.addOption('openai', this.plugin.i18n.t('providers.openai'))
				.addOption('anthropic', this.plugin.i18n.t('providers.anthropic'))
				.addOption('google', this.plugin.i18n.t('providers.google'))
				.addOption('ollama', this.plugin.i18n.t('providers.ollama'))
				.setValue(this.plugin.settings.aiProvider)
				.onChange(async (value: 'openai' | 'anthropic' | 'google' | 'ollama') => {
					this.plugin.settings.aiProvider = value;
					// Auto-select default model for the new provider
					this.plugin.settings.aiModel = this.plugin.getDefaultModelForProvider(value);
					await this.plugin.saveSettings();
					
					// Refresh models for the new provider
					if (value !== 'ollama') {
						this.plugin.refreshModels(value as 'openai' | 'anthropic' | 'google').catch(error => {
							console.log(`Failed to refresh models for ${value}:`, error);
						});
					}
					
					this.display(); // Refresh settings to show appropriate API key field and model
				}));

		const modelSetting = new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.ai_model'))
			.setDesc(this.plugin.i18n.t('settings.ai_model_desc'))
			.addDropdown(dropdown => {
				const availableModels = this.plugin.getAvailableModels();
				
				// Add available models to dropdown
				availableModels.forEach(model => {
					dropdown.addOption(model, model);
				});
				
				// Set current value or default
				const currentModel = this.plugin.settings.aiModel || this.plugin.getModelName();
				dropdown.setValue(currentModel);
				
				dropdown.onChange(async (value) => {
					this.plugin.settings.aiModel = value;
					await this.plugin.saveSettings();
				});
			});


		// Show appropriate API key field based on provider
		switch (this.plugin.settings.aiProvider) {
			case 'openai':
				new Setting(containerEl)
					.setName(this.plugin.i18n.t('settings.openai_api_key'))
					.setDesc(this.plugin.i18n.t('settings.openai_api_key_desc'))
					.addText(text => text
						.setPlaceholder('sk-...')
						.setValue(this.plugin.settings.openaiApiKey)
						.onChange(async (value) => {
							this.plugin.settings.openaiApiKey = value;
							await this.plugin.saveSettings();
						}));
				break;
				
			case 'anthropic':
				new Setting(containerEl)
					.setName(this.plugin.i18n.t('settings.anthropic_api_key'))
					.setDesc(this.plugin.i18n.t('settings.anthropic_api_key_desc'))
					.addText(text => text
						.setPlaceholder('sk-ant-...')
						.setValue(this.plugin.settings.anthropicApiKey)
						.onChange(async (value) => {
							this.plugin.settings.anthropicApiKey = value;
							await this.plugin.saveSettings();
						}));
				break;
				
			case 'google':
				new Setting(containerEl)
					.setName(this.plugin.i18n.t('settings.google_api_key'))
					.setDesc(this.plugin.i18n.t('settings.google_api_key_desc'))
					.addText(text => text
						.setPlaceholder('AIza...')
						.setValue(this.plugin.settings.googleApiKey)
						.onChange(async (value) => {
							this.plugin.settings.googleApiKey = value;
							await this.plugin.saveSettings();
						}));
				break;
				
			case 'ollama':
				new Setting(containerEl)
					.setName(this.plugin.i18n.t('settings.ollama_endpoint'))
					.setDesc(this.plugin.i18n.t('settings.ollama_endpoint_desc'))
					.addText(text => text
						.setPlaceholder('http://localhost:11434')
						.setValue(this.plugin.settings.ollamaEndpoint)
						.onChange(async (value) => {
							this.plugin.settings.ollamaEndpoint = value;
							await this.plugin.saveSettings();
						}));
				break;
		}

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.default_folder'))
			.setDesc(this.plugin.i18n.t('settings.default_folder_desc'))
			.addText(text => {
				const input = text
					.setPlaceholder('Naver Blog Posts')
					.setValue(this.plugin.settings.defaultFolder)
					.onChange(async (value) => {
						this.plugin.settings.defaultFolder = value;
						await this.plugin.saveSettings();
					});
				
				// Add folder dropdown functionality
				this.setupFolderDropdown(input.inputEl, (folder) => {
					this.plugin.settings.defaultFolder = folder;
					this.plugin.saveSettings();
					input.setValue(folder);
				}, () => {
					this.plugin.settings.defaultFolder = '';
					this.plugin.saveSettings();
					input.setValue('');
				});
				
				return input;
			});

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.enable_ai_tags'))
			.setDesc(this.plugin.i18n.t('settings.enable_ai_tags_desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAiTags)
				.onChange(async (value) => {
					this.plugin.settings.enableAiTags = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.enable_ai_excerpt'))
			.setDesc(this.plugin.i18n.t('settings.enable_ai_excerpt_desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAiExcerpt)
				.onChange(async (value) => {
					this.plugin.settings.enableAiExcerpt = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.enable_duplicate_check'))
			.setDesc(this.plugin.i18n.t('settings.enable_duplicate_check_desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDuplicateCheck)
				.onChange(async (value) => {
					this.plugin.settings.enableDuplicateCheck = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.enable_image_download'))
			.setDesc(this.plugin.i18n.t('settings.enable_image_download_desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableImageDownload)
				.onChange(async (value) => {
					this.plugin.settings.enableImageDownload = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide image folder setting
				}));

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.post_import_limit'))
			.setDesc(this.plugin.i18n.t('settings.post_import_limit_desc'))
			.addText(text => text
				.setPlaceholder('0')
				.setValue(this.plugin.settings.postImportLimit.toString())
				.onChange(async (value) => {
					let numValue = parseInt(value) || 0;
					// Validate input
					if (numValue < 0) {
						numValue = 0;
						text.setValue('0');
					} else if (numValue > 1000) {
						numValue = 1000;
						text.setValue('1000');
						new Notice(this.plugin.i18n.t('notices.post_limit_exceeded'));
					}
					this.plugin.settings.postImportLimit = numValue;
					await this.plugin.saveSettings();
				}));

		if (this.plugin.settings.enableImageDownload) {
			new Setting(containerEl)
				.setName(this.plugin.i18n.t('settings.image_folder'))
				.setDesc(this.plugin.i18n.t('settings.image_folder_desc'))
				.addText(text => {
					const input = text
						.setPlaceholder('Naver Blog Posts/attachments')
						.setValue(this.plugin.settings.imageFolder)
						.onChange(async (value) => {
							this.plugin.settings.imageFolder = value;
							await this.plugin.saveSettings();
						});
					
					// Add folder dropdown functionality
					this.setupFolderDropdown(input.inputEl, (folder) => {
						this.plugin.settings.imageFolder = folder;
						this.plugin.saveSettings();
						input.setValue(folder);
					}, () => {
						this.plugin.settings.imageFolder = '';
						this.plugin.saveSettings();
						input.setValue('');
					});
					
					return input;
				});
		}


		containerEl.createEl('h3', { text: this.plugin.i18n.t('settings.subscribed_blogs') });
		
		const subscriptionDiv = containerEl.createDiv();
		this.displaySubscriptions(subscriptionDiv);

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.add_blog_id'))
			.setDesc(this.plugin.i18n.t('settings.add_blog_id_desc'))
			.addText(text => {
				text.setPlaceholder('Blog ID (e.g., yonofbooks)');
				return text;
			})
			.addButton(button => button
				.setButtonText(this.plugin.i18n.t('settings.add_button'))
				.onClick(async () => {
					const input = button.buttonEl.previousElementSibling as HTMLInputElement;
					const blogId = input.value.trim();
					if (blogId && !this.plugin.settings.subscribedBlogs.includes(blogId)) {
						this.plugin.settings.subscribedBlogs.push(blogId);
						
						// Initialize blog subscription with default count
						this.plugin.settings.blogSubscriptions.push({
							blogId: blogId,
							postCount: 10
						});
						
						await this.plugin.saveSettings();
						input.value = '';
						this.displaySubscriptions(subscriptionDiv);
					}
				}));
	}

	displaySubscriptions(containerEl: HTMLElement) {
		containerEl.empty();
		
		if (this.plugin.settings.subscribedBlogs.length === 0) {
			containerEl.createEl('p', { text: this.plugin.i18n.t('settings.no_subscribed_blogs') });
			return;
		}

		this.plugin.settings.subscribedBlogs.forEach((blogId, index) => {
			const blogDiv = containerEl.createDiv();
			blogDiv.style.display = 'grid';
			blogDiv.style.gridTemplateColumns = '1fr auto auto auto';
			blogDiv.style.gap = '10px';
			blogDiv.style.alignItems = 'center';
			blogDiv.style.padding = '10px';
			blogDiv.style.border = '1px solid var(--background-modifier-border)';
			blogDiv.style.borderRadius = '4px';
			blogDiv.style.marginBottom = '5px';
			
			// Blog ID
			blogDiv.createEl('span', { text: blogId });
			
			// Post count setting
			const countDiv = blogDiv.createDiv();
			countDiv.style.display = 'flex';
			countDiv.style.alignItems = 'center';
			countDiv.style.gap = '5px';
			
			const countLabel = countDiv.createEl('span', { text: this.plugin.i18n.t('settings.posts_label') + ':' });
			countLabel.style.fontSize = '0.9em';
			countLabel.style.color = 'var(--text-muted)';
			
			const blogSubscription = this.plugin.settings.blogSubscriptions.find(sub => sub.blogId === blogId);
			const currentCount = blogSubscription?.postCount || 10;
			
			const countInput = countDiv.createEl('input', {
				type: 'number',
				value: currentCount.toString()
			});
			countInput.style.width = '60px';
			countInput.style.padding = '2px 4px';
			countInput.style.fontSize = '0.9em';
			countInput.min = '1';
			countInput.max = '100';
			
			countInput.onchange = async () => {
				const newCount = parseInt(countInput.value) || 10;
				
				// Update or create blog subscription
				const existingIndex = this.plugin.settings.blogSubscriptions.findIndex(sub => sub.blogId === blogId);
				if (existingIndex >= 0) {
					this.plugin.settings.blogSubscriptions[existingIndex].postCount = newCount;
				} else {
					this.plugin.settings.blogSubscriptions.push({
						blogId: blogId,
						postCount: newCount
					});
				}
				
				await this.plugin.saveSettings();
			};
			
			// Sync button
			const syncButton = blogDiv.createEl('button', { text: this.plugin.i18n.t('settings.sync_button') });
			syncButton.style.fontSize = '0.8em';
			syncButton.style.padding = '4px 8px';
			syncButton.onclick = async () => {
				try {
					new Notice(`Syncing ${blogId}...`);
					const posts = await this.plugin.fetchNaverBlogPosts(blogId, currentCount);
					
					let successCount = 0;
					for (const post of posts) {
						try {
							await this.plugin.createMarkdownFile(post);
							successCount++;
						} catch (error) {
							console.error(`Failed to save post ${post.logNo}:`, error);
						}
					}
					
					new Notice(`✓ Synced ${successCount} posts from ${blogId}`);
				} catch (error) {
					new Notice(`✗ Failed to sync ${blogId}: ${error.message}`);
					console.error('Sync error:', error);
				}
			};
			
			// Remove button
			const removeButton = blogDiv.createEl('button', { text: this.plugin.i18n.t('settings.remove_button') });
			removeButton.style.fontSize = '0.8em';
			removeButton.style.padding = '4px 8px';
			removeButton.style.backgroundColor = 'var(--interactive-accent)';
			removeButton.style.color = 'var(--text-on-accent)';
			removeButton.onclick = async () => {
				// Remove from subscribed blogs
				this.plugin.settings.subscribedBlogs.splice(index, 1);
				
				// Remove from blog subscriptions
				const subIndex = this.plugin.settings.blogSubscriptions.findIndex(sub => sub.blogId === blogId);
				if (subIndex >= 0) {
					this.plugin.settings.blogSubscriptions.splice(subIndex, 1);
				}
				
				await this.plugin.saveSettings();
				this.displaySubscriptions(containerEl);
			};
		});
	}

	getAllFolders(): string[] {
		const folders: string[] = [''];
		const abstractFiles = this.app.vault.getAllLoadedFiles();
		
		for (const file of abstractFiles) {
			if (file instanceof TFolder) { // This is a folder
				folders.push(file.path);
			}
		}
		
		return folders.sort();
	}

	setupFolderDropdown(inputEl: HTMLInputElement, onSelect: (folder: string) => void, onClear?: () => void) {
		let dropdownEl: HTMLElement | null = null;
		let isDropdownVisible = false;
		let searchIcon: HTMLElement | null = null;
		let clearButton: HTMLElement | null = null;

		// Create wrapper container for input with icons
		const wrapper = document.createElement('div');
		wrapper.style.cssText = `
			position: relative;
			display: flex;
			align-items: center;
		`;

		// Insert wrapper before input and move input into it
		inputEl.parentNode?.insertBefore(wrapper, inputEl);
		wrapper.appendChild(inputEl);

		// Create search icon
		searchIcon = document.createElement('div');
		searchIcon.innerHTML = '🔍';
		searchIcon.style.cssText = `
			position: absolute;
			left: 8px;
			top: 50%;
			transform: translateY(-50%);
			color: var(--text-muted);
			pointer-events: none;
			z-index: 1;
		`;
		wrapper.appendChild(searchIcon);

		// Add padding to input for search icon
		inputEl.style.paddingLeft = '32px';

		// Create clear button (initially hidden)
		const updateClearButton = () => {
			if (clearButton) {
				clearButton.remove();
				clearButton = null;
			}

			if (inputEl.value.trim() && onClear) {
				clearButton = document.createElement('div');
				clearButton.innerHTML = '×';
				clearButton.style.cssText = `
					position: absolute;
					right: 8px;
					top: 50%;
					transform: translateY(-50%);
					color: var(--text-muted);
					cursor: pointer;
					font-size: 16px;
					font-weight: bold;
					z-index: 1;
					width: 16px;
					height: 16px;
					display: flex;
					align-items: center;
					justify-content: center;
					border-radius: 50%;
					transition: all 0.1s;
				`;

				clearButton.addEventListener('mouseenter', () => {
					if (clearButton) {
						clearButton.style.backgroundColor = 'var(--background-modifier-hover)';
						clearButton.style.color = 'var(--text-normal)';
					}
				});

				clearButton.addEventListener('mouseleave', () => {
					if (clearButton) {
						clearButton.style.backgroundColor = '';
						clearButton.style.color = 'var(--text-muted)';
					}
				});

				clearButton.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					if (onClear) {
						onClear();
					}
					updateClearButton();
				});

				wrapper.appendChild(clearButton);
				inputEl.style.paddingRight = '28px';
			} else {
				inputEl.style.paddingRight = '';
			}
		};

		// Initial clear button update
		updateClearButton();

		const showDropdown = (filter: string = '') => {
			this.hideDropdown();
			
			const folders = this.getAllFolders();
			const filteredFolders = folders.filter(folder => 
				folder.toLowerCase().includes(filter.toLowerCase())
			);

			if (filteredFolders.length === 0) return;

			dropdownEl = document.createElement('div');
			dropdownEl.className = 'folder-dropdown';
			dropdownEl.style.cssText = `
				position: absolute;
				top: 100%;
				left: 0;
				width: ${inputEl.offsetWidth}px;
				max-height: 200px;
				overflow-y: auto;
				background: var(--background-primary);
				border: 1px solid var(--background-modifier-border);
				border-radius: 6px;
				box-shadow: var(--shadow-s);
				z-index: 1000;
				margin-top: 2px;
			`;

			filteredFolders.forEach((folder, index) => {
				const itemEl = document.createElement('div');
				itemEl.className = 'folder-dropdown-item';
				itemEl.textContent = folder || '(Root)';
				itemEl.style.cssText = `
					padding: 8px 12px;
					cursor: pointer;
					border-bottom: 1px solid var(--background-modifier-border);
					transition: background-color 0.1s;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
					font-size: 13px;
					line-height: 1.3;
				`;

				if (index === filteredFolders.length - 1) {
					itemEl.style.borderBottom = 'none';
				}

				itemEl.addEventListener('mouseenter', () => {
					itemEl.style.backgroundColor = 'var(--background-modifier-hover)';
				});

				itemEl.addEventListener('mouseleave', () => {
					itemEl.style.backgroundColor = '';
				});

				itemEl.addEventListener('click', () => {
					onSelect(folder);
					this.hideDropdown();
					updateClearButton();
				});

				dropdownEl.appendChild(itemEl);
			});

			// Position the dropdown relative to the wrapper
			wrapper.style.position = 'relative';
			wrapper.appendChild(dropdownEl);
			isDropdownVisible = true;
		};

		const hideDropdown = () => {
			if (dropdownEl && dropdownEl.parentNode) {
				dropdownEl.parentNode.removeChild(dropdownEl);
				dropdownEl = null;
				isDropdownVisible = false;
			}
		};

		this.hideDropdown = hideDropdown;

		// Show dropdown on focus/click
		inputEl.addEventListener('focus', () => {
			showDropdown(inputEl.value);
		});

		inputEl.addEventListener('click', () => {
			if (!isDropdownVisible) {
				showDropdown(inputEl.value);
			}
		});

		// Filter dropdown on input and update clear button
		inputEl.addEventListener('input', () => {
			if (isDropdownVisible) {
				showDropdown(inputEl.value);
			}
			updateClearButton();
		});

		// Hide dropdown on blur (with delay to allow clicks)
		inputEl.addEventListener('blur', () => {
			setTimeout(() => {
				hideDropdown();
			}, 150);
		});

		// Hide dropdown on escape key
		inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				hideDropdown();
			}
		});
	}

	createImportSummary(successCount: number, errorLogCount: number, errorCount: number, totalPosts: number): string {
		let summary = `Import complete: ${successCount} successful`;
		
		if (errorLogCount > 0) {
			summary += `, ${errorLogCount} error logs created`;
		}
		
		if (errorCount > 0) {
			summary += `, ${errorCount} file creation errors`;
		}
		
		summary += ` (${totalPosts} total)`;
		
		if (errorLogCount > 0 || errorCount > 0) {
			summary += ` ⚠️`;
		} else {
			summary += ` ✅`;
		}
		
		return summary;
	}

	hideDropdown() {
		// This will be overridden in setupFolderDropdown
	}
}

class FolderSuggestModal extends Modal {
	folders: string[];
	onChoose: (folder: string) => void;
	
	constructor(app: App, folders: string[], onChoose: (folder: string) => void) {
		super(app);
		this.folders = folders;
		this.onChoose = onChoose;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'Select Folder' });

		const inputEl = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Type to filter folders...'
		});
		inputEl.style.width = '100%';
		inputEl.style.marginBottom = '10px';

		const listEl = contentEl.createEl('div');
		listEl.style.maxHeight = '300px';
		listEl.style.overflowY = 'auto';

		const renderFolders = (filter: string = '') => {
			listEl.empty();
			
			const filteredFolders = this.folders.filter(folder => 
				folder.toLowerCase().includes(filter.toLowerCase())
			);

			for (const folder of filteredFolders) {
				const folderEl = listEl.createEl('div', {
					text: folder || '(Root)',
					cls: 'suggestion-item'
				});
				folderEl.style.padding = '8px';
				folderEl.style.cursor = 'pointer';
				folderEl.style.borderBottom = '1px solid var(--background-modifier-border)';
				
				folderEl.addEventListener('click', () => {
					this.onChoose(folder);
					this.close();
				});

				folderEl.addEventListener('mouseenter', () => {
					folderEl.style.backgroundColor = 'var(--background-modifier-hover)';
				});

				folderEl.addEventListener('mouseleave', () => {
					folderEl.style.backgroundColor = '';
				});
			}
		};

		inputEl.addEventListener('input', () => {
			renderFolders(inputEl.value);
		});

		// Initial render
		renderFolders();

		// Focus the input
		setTimeout(() => inputEl.focus(), 100);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class NaverBlogSinglePostModal extends Modal {
	plugin: NaverBlogPlugin;

	constructor(app: App, plugin: NaverBlogPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: this.plugin.i18n.t('modals.import_single_post.title') });

		const inputContainer = contentEl.createDiv();
		inputContainer.style.marginBottom = '20px';

		const inputLabel = inputContainer.createEl('label', {
			text: this.plugin.i18n.t('modals.import_single_post.log_no_label') + ':',
			cls: 'setting-item-name'
		});
		inputLabel.style.display = 'block';
		inputLabel.style.marginBottom = '8px';

		const input = inputContainer.createEl('input', {
			type: 'text',
			placeholder: this.plugin.i18n.t('modals.import_single_post.log_no_placeholder')
		});
		input.style.width = '100%';
		input.style.padding = '8px';
		input.style.border = '1px solid var(--background-modifier-border)';
		input.style.borderRadius = '4px';

		const exampleDiv = inputContainer.createDiv();
		exampleDiv.style.marginTop = '8px';
		exampleDiv.style.fontSize = '0.9em';
		exampleDiv.style.color = 'var(--text-muted)';
		exampleDiv.innerHTML = `
			<strong>Examples:</strong><br>
			• Desktop URL: https://blog.naver.com/yonofbooks/220883239733<br>
			• Mobile URL: https://m.blog.naver.com/PostView.naver?blogId=xk2a1&logNo=223926972265<br>
			• LogNo only: 220883239733
		`;

		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '10px';
		buttonContainer.style.justifyContent = 'flex-end';

		const cancelButton = buttonContainer.createEl('button', {
			text: this.plugin.i18n.t('modals.import_single_post.cancel_button')
		});
		cancelButton.addEventListener('click', () => this.close());

		const importButton = buttonContainer.createEl('button', {
			text: this.plugin.i18n.t('modals.import_single_post.import_button'),
			cls: 'mod-cta'
		});

		importButton.addEventListener('click', async () => {
			const inputValue = input.value.trim();
			if (!inputValue) {
				new Notice('Please enter a post URL or LogNo');
				return;
			}

			// Parse input to extract blogId and logNo
			let blogId = '';
			let logNo = '';

			if (inputValue.includes('blog.naver.com') || inputValue.includes('m.blog.naver.com')) {
				// Handle both desktop and mobile URLs
				let urlMatch;
				
				if (inputValue.includes('m.blog.naver.com')) {
					// Mobile URL format: https://m.blog.naver.com/PostView.naver?blogId=xk2a1&logNo=223926972265
					urlMatch = inputValue.match(/[?&]blogId=([^&]+).*[?&]logNo=(\d+)/);
				} else {
					// Desktop URL format: https://blog.naver.com/blogid/logno
					urlMatch = inputValue.match(/blog\.naver\.com\/([^\/]+)\/(\d+)/);
				}
				
				if (urlMatch) {
					blogId = urlMatch[1];
					logNo = urlMatch[2];
				} else {
					new Notice('Invalid Naver blog URL format');
					return;
				}
			} else if (/^\d{8,15}$/.test(inputValue)) {
				// LogNo only - need to ask for blog ID or use default
				blogId = 'yonofbooks'; // Default for testing, could be made configurable
				logNo = inputValue;
				new Notice(`Using default blog ID: ${blogId}`, 3000);
			} else {
				new Notice('Please enter a valid URL or LogNo (8-15 digits)');
				return;
			}

			// Start import process
			this.close();
			
			try {
				new Notice(`Importing post ${logNo} from ${blogId}...`, 3000);
				
				const fetcher = new NaverBlogFetcher(blogId);
				const post = await fetcher.fetchSinglePost(logNo);
				
				console.log('Single post import result:', post);
				
				// Create the file
				await this.plugin.createMarkdownFile({
					...post,
					tags: ['imported'],
					excerpt: post.content.substring(0, 150) + '...'
				});
				
				new Notice(`✓ Successfully imported: "${post.title}"`, 5000);
			} catch (error) {
				console.error('Single post import failed:', error);
				new Notice(`✗ Failed to import post: ${error.message}`, 5000);
			}
		});

		// Enter key to import
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				importButton.click();
			}
		});

		// Focus the input
		setTimeout(() => input.focus(), 100);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}