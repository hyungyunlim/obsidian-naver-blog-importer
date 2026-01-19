import {
	Plugin,
	Notice,
	TFile,
	normalizePath,
	getFrontMatterInfo,
	requestUrl
} from 'obsidian';

import { I18n } from './src/utils/i18n';
import { AIService } from './src/services/ai-service';
import { BlogService } from './src/services/blog-service';
import { BrunchService } from './src/services/brunch-service';
import { ImageService } from './src/services/image-service';
import { VideoService } from './src/services/video-service';
import { NaverBlogImportModal } from './src/ui/modals/import-modal';
import { NaverBlogSubscribeModal } from './src/ui/modals/subscribe-modal';
import { NaverBlogSettingTab } from './src/ui/settings-tab';
import { LocaleUtils } from './src/utils/locale-utils';
import { ContentUtils } from './src/utils/content-utils';
import { SettingsUtils } from './src/utils/settings-utils';
import { convertCommentsToMarkdown, convertBrunchCommentsToMarkdown } from './src/utils/comment-utils';
import { BrunchFetcher } from './brunch-fetcher';
import { APIClientFactory } from './src/api';
import {
	NaverBlogSettings,
	DEFAULT_SETTINGS,
	DEFAULT_CAFE_SETTINGS,
	DEFAULT_NEWS_SETTINGS,
	DEFAULT_BRUNCH_SETTINGS,
	ProcessedBlogPost,
	ProcessedCafePost,
	ProcessedBrunchPost
} from './src/types';
import {
	NOTICE_TIMEOUTS,
	UI_DELAYS,
	API_DELAYS,
	AI_TOKEN_LIMITS
} from './src/constants';

export default class NaverBlogPlugin extends Plugin {
	settings: NaverBlogSettings;
	i18n: I18n;
	aiService: AIService;
	blogService: BlogService;
	brunchService: BrunchService;
	imageService: ImageService;
	videoService: VideoService;
	
	// Cached API models
	private openai_models: string[] = [];
	private anthropic_models: string[] = [];
	private google_models: string[] = [];

	async onload() {
		await this.loadSettings();
		
		// Initialize translations
		this.i18n = new I18n(this.app);
		// Detect locale from Obsidian's language setting
		const locale = LocaleUtils.detectLocale();
		this.i18n.loadTranslations(locale);

		// Initialize AI service
		this.aiService = new AIService(this.settings);

		// Initialize Blog service
		this.blogService = new BlogService(this.app, this.settings, this.createMarkdownFile.bind(this));

		// Initialize Image service
		this.imageService = new ImageService(this.app, this.settings);

		// Initialize Video service
		this.videoService = new VideoService(this.app, this.settings);

		// Initialize Brunch service
		this.brunchService = new BrunchService(this.app, this.settings, this.createBrunchMarkdownFile.bind(this));

		// Fetch models from APIs in background
		void this.refreshModels().catch(() => {
			// Silently ignore startup model refresh errors
		});

		// Add ribbon icon
		this.addRibbonIcon('download', 'Import Naver blog', (evt: MouseEvent) => {
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
			id: 'rewrite-current-note',
			name: this.i18n.t('commands.ai-fix-layout'),
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				const hasMarkdownFile = activeFile && activeFile.path.endsWith('.md');

				if (checking) {
					// This is called to check if the command should be available
					return hasMarkdownFile;
				}

				// This is called when the command is executed
				if (hasMarkdownFile) {
					// Check API key first - use AI service to verify
					try {
						// This will validate API key internally
						this.aiService.getModelName();
					} catch (error) {
						new Notice(this.i18n.t('notices.api_key_required', { provider: this.settings.aiProvider.toUpperCase() }), 8000);
						new Notice(this.i18n.t('notices.set_api_key'), NOTICE_TIMEOUTS.medium);
						return;
					}

					void this.rewriteCurrentNote(activeFile);
				}
			}
		});

		this.addCommand({
			id: 'delete-note-with-images',
			name: this.i18n.t('commands.delete-note-with-images'),
			checkCallback: (checking: boolean) => {
				const activeFile = this.app.workspace.getActiveFile();
				const hasMarkdownFile = activeFile && activeFile.path.endsWith('.md');

				if (checking) {
					return hasMarkdownFile;
				}

				if (hasMarkdownFile) {
					void this.deleteNoteWithImages(activeFile);
				}
			}
		});

		// Auto-sync all subscriptions on startup (consolidated)
		const hasBlogSubscriptions = this.settings.subscribedBlogs.length > 0;
		const brunchSubscriptions = this.settings.brunchSettings?.subscribedBrunchAuthors || [];
		const hasBrunchSubscriptions = brunchSubscriptions.length > 0;

		if (hasBlogSubscriptions || hasBrunchSubscriptions) {
			setTimeout(() => void this.autoSyncAllSubscriptions(), UI_DELAYS.autoSync);
		}

		// Add settings tab
		this.addSettingTab(new NaverBlogSettingTab(this.app, this));
	}

	onunload() {
		// Cleanup if needed
	}

	/**
	 * Auto-sync all subscriptions with consolidated notifications
	 */
	private async autoSyncAllSubscriptions(): Promise<void> {
		const blogCount = this.settings.subscribedBlogs.length;
		const brunchAuthors = this.settings.brunchSettings?.subscribedBrunchAuthors || [];
		const brunchCount = brunchAuthors.length;

		// Build summary of what we're syncing
		const syncTargets: string[] = [];
		if (blogCount > 0) syncTargets.push(`${blogCount} blog${blogCount > 1 ? 's' : ''}`);
		if (brunchCount > 0) syncTargets.push(`${brunchCount} Brunch author${brunchCount > 1 ? 's' : ''}`);

		if (syncTargets.length === 0) return;

		// Show single starting notice
		const syncNotice = new Notice(`Syncing subscriptions: ${syncTargets.join(', ')}...`, 0);

		let totalBlogPosts = 0;
		let totalBrunchPosts = 0;
		let totalErrors = 0;

		try {
			// Sync blogs silently
			if (blogCount > 0) {
				const blogResult = await this.blogService.syncSubscribedBlogs({ silent: true });
				totalBlogPosts = blogResult.newPosts;
				totalErrors += blogResult.errors;
			}

			// Sync Brunch silently
			if (brunchCount > 0) {
				const brunchResult = await this.brunchService.syncSubscribedAuthors({ silent: true });
				totalBrunchPosts = brunchResult.newPosts;
				totalErrors += brunchResult.errors;
			}
		} finally {
			syncNotice.hide();

			// Show consolidated summary
			const totalPosts = totalBlogPosts + totalBrunchPosts;
			if (totalPosts > 0 || totalErrors > 0) {
				const parts: string[] = [];
				if (totalBlogPosts > 0) parts.push(`${totalBlogPosts} from blogs`);
				if (totalBrunchPosts > 0) parts.push(`${totalBrunchPosts} from Brunch`);

				let summary = `Sync completed: ${parts.join(', ')}`;
				if (parts.length === 0) summary = 'Sync completed: no new posts';
				if (totalErrors > 0) summary += ` (${totalErrors} error${totalErrors > 1 ? 's' : ''})`;

				new Notice(summary, 6000);
			} else {
				new Notice('Sync completed: no new posts found', 4000);
			}
		}
	}

	async loadSettings() {
		const loadedData = await this.loadData();
		this.settings = Object.assign({}, DEFAULT_SETTINGS, loadedData);
		// Ensure cafeSettings exists with defaults
		if (!this.settings.cafeSettings) {
			this.settings.cafeSettings = { ...DEFAULT_CAFE_SETTINGS };
		} else {
			this.settings.cafeSettings = Object.assign({}, DEFAULT_CAFE_SETTINGS, this.settings.cafeSettings);
		}
		// Ensure newsSettings exists with defaults
		if (!this.settings.newsSettings) {
			this.settings.newsSettings = { ...DEFAULT_NEWS_SETTINGS };
		} else {
			this.settings.newsSettings = Object.assign({}, DEFAULT_NEWS_SETTINGS, this.settings.newsSettings);
		}
		// Ensure brunchSettings exists with defaults
		if (!this.settings.brunchSettings) {
			this.settings.brunchSettings = { ...DEFAULT_BRUNCH_SETTINGS };
		} else {
			this.settings.brunchSettings = Object.assign({}, DEFAULT_BRUNCH_SETTINGS, this.settings.brunchSettings);
		}
	}

	async saveSettings() {
		// Validate and normalize settings
		this.settings = SettingsUtils.validateAndNormalizeSettings(this.settings);
		
		await this.saveData(this.settings);
		// Update services when settings change
		this.aiService = new AIService(this.settings);
		this.blogService.updateSettings(this.settings);
		this.brunchService.updateSettings(this.settings);
		this.imageService.updateSettings(this.settings);
		this.videoService.updateSettings(this.settings);
	}

	async fetchNaverBlogPosts(blogId: string, maxPosts?: number): Promise<ProcessedBlogPost[]> {
		return await this.blogService.fetchNaverBlogPosts(blogId, maxPosts);
	}

	async callAI(messages: Array<{role: string, content: string}>, maxTokens: number = 150): Promise<string> {
		const apiKey = APIClientFactory.getApiKey(this.settings);
		if (!apiKey) {
			throw new Error('No API key configured for selected AI provider');
		}

		const model = APIClientFactory.getModelName(this.settings);
		const client = APIClientFactory.createClient(this.settings);
		
		return await client.chat(messages, maxTokens, model);
	}

	getModelName(): string {
		return APIClientFactory.getModelName(this.settings);
	}

	getAvailableModels(): string[] {
		const cache = { 
			openai_models: this.openai_models,
			anthropic_models: this.anthropic_models,
			google_models: this.google_models
		};
		
		return this.aiService.getAvailableModels(cache, this.settings.aiProvider);
	}
	
	getStaticModels(): string[] {
		return this.aiService.getStaticModels(this.settings.aiProvider);
	}

	async fetchModelsFromAPI(provider: 'openai' | 'anthropic' | 'google'): Promise<string[]> {
		try {
			return await APIClientFactory.fetchModels(this.settings, provider);
		} catch {
			return [];
		}
	}




	async refreshModels(provider?: 'openai' | 'anthropic' | 'google'): Promise<void> {
		if (provider) {
			// Refresh specific provider
			const models = await this.fetchModelsFromAPI(provider);
			switch (provider) {
				case 'openai': {
					this.openai_models = models;
					break;
				}
				case 'anthropic': {
					this.anthropic_models = models;
					break;
				}
				case 'google': {
					this.google_models = models;
					break;
				}
			}
		} else {
			// Refresh all providers
			const [openaiModels, anthropicModels, googleModels] = await Promise.all([
				this.fetchModelsFromAPI('openai'),
				this.fetchModelsFromAPI('anthropic'),
				this.fetchModelsFromAPI('google')
			]);
			
			this.openai_models = openaiModels;
			this.anthropic_models = anthropicModels;
			this.google_models = googleModels;
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
			const maxTokens = this.settings.aiModel.includes('pro') ? AI_TOKEN_LIMITS.pro : AI_TOKEN_LIMITS.default;
			const content_text = await this.aiService.callAI(messages, maxTokens);
			
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
			} catch {
				// console.warn('Failed to parse tags as JSON:', content_text);
				// Fallback parsing - extract array from text
				const matches = content_text.match(/\[(.*?)\]/s);
				if (matches) {
					try {
						// Try to parse the matched content as JSON
						const arrayContent = '[' + matches[1] + ']';
						const tags = JSON.parse(arrayContent);
						return Array.isArray(tags) ? tags : [];
					} catch {
						// Manual parsing if JSON fails
						return matches[1].split(',').map((tag: string) => tag.trim().replace(/["\n]/g, ''));
					}
				}
				return [];
			}
		} catch {
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
			const maxTokens = this.settings.aiModel.includes('pro') ? AI_TOKEN_LIMITS.pro : AI_TOKEN_LIMITS.default;
			return await this.aiService.callAI(messages, maxTokens);
		} catch {
			return '';
		} finally {
			notice.hide();
		}
	}

	async createMarkdownFile(post: ProcessedBlogPost): Promise<TFile | null> {
		try {
			// Generate AI tags and append to original tags (avoid duplicates)
			if (this.settings.enableAiTags) {
				const aiTags = await this.generateAITags(post.title, post.content);
				if (aiTags && aiTags.length > 0) {
					const existingTags = new Set(post.tags.map(t => t.toLowerCase()));
					const newTags = aiTags.filter(t => !existingTags.has(t.toLowerCase()));
					post.tags = [...post.tags, ...newTags];
				}
			}

			if (this.settings.enableAiExcerpt) {
				// Add small delay between AI calls to avoid rate limiting
				if (this.settings.enableAiTags) {
					await new Promise(resolve => setTimeout(resolve, API_DELAYS.betweenPosts));
				}
				post.excerpt = await this.generateAIExcerpt(post.title, post.content);
			}

			// Create filename and folder paths first (needed for video processing)
			const filename = this.imageService.sanitizeFilename(`${post.title}.md`);
			const baseFolder = normalizePath(this.settings.defaultFolder || DEFAULT_SETTINGS.defaultFolder);
			// Store posts under blogId subfolder
			const folder = normalizePath(`${baseFolder}/${post.blogId}`);
			// Blog images/videos go to attachments subfolder inside the blog folder
			const blogImageFolder = normalizePath(`${folder}/attachments`);

			// Process images if enabled
			let processedContent = post.content;
			if (this.settings.enableImageDownload) {
				processedContent = await this.imageService.downloadAndProcessImages(post.content, post.logNo, blogImageFolder, folder);
			}

			// Process videos if contentHtml is available (video metadata extraction requires raw HTML)
			if (post.contentHtml && this.settings.enableImageDownload) {
				processedContent = await this.videoService.downloadAndProcessVideos(
					processedContent,
					post.contentHtml,
					post.logNo,
					blogImageFolder, // Videos stored in same folder as images
					folder
				);
			}

			// Ensure base folder exists
			const baseFolderExists = this.app.vault.getAbstractFileByPath(baseFolder);
			if (!baseFolderExists) {
				await this.app.vault.createFolder(baseFolder);
			}

			// Ensure blogId subfolder exists
			const folderExists = this.app.vault.getAbstractFileByPath(folder);
			if (!folderExists) {
				await this.app.vault.createFolder(folder);
			}

			const filepath = normalizePath(`${folder}/${filename}`);

			// Create frontmatter
			const frontmatter = ContentUtils.createFrontmatter(post, this.imageService.sanitizeFilename.bind(this.imageService));

			// Create full content
			const fullContent = `${frontmatter}\n${processedContent}`;

			// Check if file already exists
			const fileExists = this.app.vault.getAbstractFileByPath(filepath);
			if (fileExists) {
				// File already exists, skip silently
				return null;
			}

			// Create the file
			const createdFile = await this.app.vault.create(filepath, fullContent);

			new Notice(`Created: ${filename}`);
			return createdFile;
		} catch (error) {
			new Notice(`Failed to create file for: ${post.title}`);
			return null;
		}
	}

	async createCafeMarkdownFile(post: ProcessedCafePost): Promise<TFile | null> {
		try {
			// Generate AI tags and excerpt if enabled
			if (this.settings.enableAiTags) {
				post.tags = await this.generateAITags(post.title, post.content);
			}

			if (this.settings.enableAiExcerpt) {
				if (this.settings.enableAiTags) {
					await new Promise(resolve => setTimeout(resolve, API_DELAYS.betweenPosts));
				}
				post.excerpt = await this.generateAIExcerpt(post.title, post.content);
			}

			// Create filename and folder paths first (needed for image processing)
			const filename = this.imageService.sanitizeFilename(`${post.title}.md`);
			const baseFolder = normalizePath(this.settings.cafeSettings?.cafeImportFolder || DEFAULT_CAFE_SETTINGS.cafeImportFolder);
			// Store posts under cafeName subfolder (fallback to cafeUrl if cafeName is empty)
			const subfolderName = this.imageService.sanitizeFilename(post.cafeName || post.cafeUrl);
			const folder = normalizePath(`${baseFolder}/${subfolderName}`);
			// Cafe images go to attachments subfolder inside the cafe folder
			const cafeImageFolder = normalizePath(`${folder}/attachments`);

			// Process images if enabled (use cafeSettings if available, otherwise use blog's enableImageDownload)
			let processedContent = post.content;
			const shouldDownloadImages = this.settings.cafeSettings?.downloadCafeImages ?? this.settings.enableImageDownload;
			if (shouldDownloadImages) {
				// Pass custom folders: images go to cafe's attachments folder, notes are in cafe folder
				processedContent = await this.imageService.downloadAndProcessImages(post.content, post.articleId, cafeImageFolder, folder);
			}

			// Process videos if contentHtml is available (video metadata extraction requires raw HTML)
			if (post.contentHtml && shouldDownloadImages) {
				processedContent = await this.videoService.downloadAndProcessVideos(
					processedContent,
					post.contentHtml,
					post.articleId,
					cafeImageFolder, // Videos stored in same folder as images
					folder
				);
			}

			// Ensure base folder exists
			const baseFolderExists = this.app.vault.getAbstractFileByPath(baseFolder);
			if (!baseFolderExists) {
				await this.app.vault.createFolder(baseFolder);
			}

			// Ensure cafeName subfolder exists
			const folderExists = this.app.vault.getAbstractFileByPath(folder);
			if (!folderExists) {
				await this.app.vault.createFolder(folder);
			}

			const filepath = normalizePath(`${folder}/${filename}`);

			// Create frontmatter for cafe post
			const frontmatter = this.createCafeFrontmatter(post);

			// Add comments section if enabled and comments exist
			let commentsSection = '';
			const includeComments = this.settings.cafeSettings?.includeComments ?? true;
			if (includeComments && post.comments && post.comments.length > 0) {
				commentsSection = '\n\n' + convertCommentsToMarkdown(post.comments);
			}

			// Create full content
			const fullContent = `${frontmatter}\n${processedContent}${commentsSection}`;

			// Check if file already exists
			const fileExists = this.app.vault.getAbstractFileByPath(filepath);
			if (fileExists) {
				return null;
			}

			// Create the file
			const createdFile = await this.app.vault.create(filepath, fullContent);

			new Notice(`Created: ${filename}`);
			return createdFile;
		} catch (error) {
			new Notice(`Failed to create file for: ${post.title}`);
			return null;
		}
	}

	private createCafeFrontmatter(post: ProcessedCafePost): string {
		const lines: string[] = ['---'];

		lines.push(`title: "${post.title.replace(/"/g, '\\"')}"`);
		lines.push(`date: ${post.date}`);
		lines.push(`author: "${post.author}"`);
		lines.push(`articleId: "${post.articleId}"`);
		lines.push(`cafeId: "${post.cafeId}"`);
		lines.push(`cafeName: "${post.cafeName}"`);
		lines.push(`cafeUrl: "${post.cafeUrl}"`);
		if (post.menuName) {
			lines.push(`menuName: "${post.menuName}"`);
		}
		lines.push(`url: "${post.url}"`);
		lines.push(`source: naver-cafe`);

		if (post.tags && post.tags.length > 0) {
			lines.push('tags:');
			post.tags.forEach(tag => {
				lines.push(`  - "${tag.replace(/"/g, '\\"')}"`);
			});
		}

		if (post.excerpt) {
			lines.push(`excerpt: "${post.excerpt.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`);
		}

		if (post.viewCount !== undefined) {
			lines.push(`viewCount: ${post.viewCount}`);
		}
		if (post.commentCount !== undefined) {
			lines.push(`commentCount: ${post.commentCount}`);
		}

		lines.push('---');
		return lines.join('\n');
	}

	async createBrunchMarkdownFile(post: ProcessedBrunchPost): Promise<TFile | null> {
		try {
			// Generate AI tags if enabled and no original tags
			if (this.settings.enableAiTags && (!post.originalTags || post.originalTags.length === 0)) {
				post.originalTags = await this.generateAITags(post.title, post.content);
			}

			// Create filename and folder paths
			// Sanitize title for filename - replace newlines with spaces
			const sanitizedTitleForFilename = post.title.replace(/[\r\n]+/g, ' ').trim();
			const filename = this.imageService.sanitizeFilename(`${sanitizedTitleForFilename}.md`);
			const baseFolder = normalizePath(this.settings.brunchSettings?.brunchImportFolder || DEFAULT_BRUNCH_SETTINGS.brunchImportFolder);
			// Store posts under username subfolder
			const subfolderName = this.imageService.sanitizeFilename(post.username);
			const folder = normalizePath(`${baseFolder}/${subfolderName}`);
			// Brunch images go to attachments subfolder
			const brunchImageFolder = normalizePath(`${folder}/attachments`);

			// Process images if enabled
			let processedContent = post.content;
			const shouldDownloadImages = this.settings.brunchSettings?.downloadBrunchImages ?? this.settings.enableImageDownload;
			if (shouldDownloadImages) {
				processedContent = await this.imageService.downloadAndProcessImages(post.content, post.postId, brunchImageFolder, folder);
			}

			// Process videos if enabled
			const shouldDownloadVideos = this.settings.brunchSettings?.downloadBrunchVideos ?? true;
			if (shouldDownloadVideos && post.videos && post.videos.length > 0) {
				processedContent = await this.downloadBrunchVideos(processedContent, post.videos, post.postId, brunchImageFolder, folder);
			}

			// Fetch and append comments if enabled
			const shouldDownloadComments = this.settings.brunchSettings?.downloadBrunchComments ?? true;
			if (shouldDownloadComments && post.userId && post.commentCount && post.commentCount > 0) {
				try {
					const fetcher = new BrunchFetcher(post.username);
					const comments = await fetcher.fetchComments(post.userId, post.postId);
					if (comments.length > 0) {
						const commentsMarkdown = convertBrunchCommentsToMarkdown(comments);
						processedContent += commentsMarkdown;
					}
				} catch (error) {
					// Continue without comments
				}
			}

			// Ensure base folder exists
			const baseFolderExists = this.app.vault.getAbstractFileByPath(baseFolder);
			if (!baseFolderExists) {
				await this.app.vault.createFolder(baseFolder);
			}

			// Ensure username subfolder exists
			const folderExists = this.app.vault.getAbstractFileByPath(folder);
			if (!folderExists) {
				await this.app.vault.createFolder(folder);
			}

			const filepath = normalizePath(`${folder}/${filename}`);

			// Create frontmatter
			const frontmatter = this.createBrunchFrontmatter(post);

			// Create full content
			const fullContent = `${frontmatter}\n${processedContent}`;

			// Check if file already exists
			const fileExists = this.app.vault.getAbstractFileByPath(filepath);
			if (fileExists) {
				return null;
			}

			// Create the file
			const createdFile = await this.app.vault.create(filepath, fullContent);

			new Notice(`Created: ${filename}`);
			return createdFile;
		} catch (error) {
			new Notice(`Failed to create file for: ${post.title}`);
			return null;
		}
	}

	private createBrunchFrontmatter(post: ProcessedBrunchPost): string {
		const lines: string[] = ['---'];

		// Sanitize title and subtitle - replace newlines with spaces for valid YAML
		const sanitizedTitle = post.title.replace(/[\r\n]+/g, ' ').replace(/"/g, '\\"').trim();
		const sanitizedSubtitle = post.subtitle?.replace(/[\r\n]+/g, ' ').replace(/"/g, '\\"').trim();

		lines.push(`platform: brunch`);
		lines.push(`title: "${sanitizedTitle}"`);
		if (sanitizedSubtitle) {
			lines.push(`subtitle: "${sanitizedSubtitle}"`);
		}
		lines.push(`date: ${post.date}`);
		lines.push(`author: "${post.authorName}"`);
		lines.push(`author_username: "@${post.username}"`);
		lines.push(`postId: "${post.postId}"`);
		lines.push(`url: "${post.url}"`);

		if (post.series) {
			const sanitizedSeriesTitle = post.series.title.replace(/[\r\n]+/g, ' ').replace(/"/g, '\\"').trim();
			lines.push(`series: "${sanitizedSeriesTitle}"`);
			if (post.series.episode) {
				lines.push(`episode: ${post.series.episode}`);
			}
			lines.push(`series_url: "${post.series.url}"`);
		}

		if (post.originalTags && post.originalTags.length > 0) {
			lines.push('tags:');
			post.originalTags.forEach(tag => {
				lines.push(`  - "${tag.trim().replace(/"/g, '\\"')}"`);
			});
		}

		if (post.likes !== undefined) {
			lines.push(`likes: ${post.likes}`);
		}
		if (post.commentCount !== undefined) {
			lines.push(`comments: ${post.commentCount}`);
		}

		if (post.thumbnail) {
			lines.push(`thumbnail: "${post.thumbnail}"`);
		}

		lines.push('---');
		return lines.join('\n');
	}

	/**
	 * Download Brunch videos and update content with local paths
	 */
	private async downloadBrunchVideos(
		content: string,
		videos: { videoId?: string; mp4Url?: string; url: string }[],
		postId: string,
		videoFolder: string,
		notesFolder: string
	): Promise<string> {
		let processedContent = content;

		// Ensure video folder exists
		const folderExists = this.app.vault.getAbstractFileByPath(videoFolder);
		if (!folderExists) {
			await this.app.vault.createFolder(videoFolder);
		}

		for (let i = 0; i < videos.length; i++) {
			const video = videos[i];
			if (!video.mp4Url || !video.videoId) {
				continue;
			}

			try {
				new Notice(`Downloading video ${i + 1}/${videos.length}...`, 3000);

				// Download the video file with proper headers
				const response = await requestUrl({
					url: video.mp4Url,
					method: 'GET',
					headers: {
						'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
						'Accept': '*/*',
						'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
						'Referer': 'https://play-tv.kakao.com/',
						'Origin': 'https://play-tv.kakao.com',
					},
				});

				if (response.status === 200 && response.arrayBuffer) {
					// Generate filename
					const filename = `${postId}_video_${i + 1}.mp4`;
					const videoPath = normalizePath(`${videoFolder}/${filename}`);

					// Save video file
					await this.app.vault.createBinary(videoPath, response.arrayBuffer);

					// Calculate relative path
					const relativePath = this.calculateRelativePath(notesFolder, videoFolder);
					const localVideoPath = `${relativePath}${filename}`;

					// Replace video placeholder in content
					// Pattern: [Video:videoId](url)
					const videoPattern = new RegExp(
						`\\[Video:${video.videoId}\\]\\([^)]*\\)`,
						'g'
					);
					processedContent = processedContent.replace(
						videoPattern,
						`![Video](${localVideoPath})`
					);

					new Notice(`Downloaded video: ${filename}`, 2000);
				}
			} catch (error) {
				// Keep original video link on failure
			}
		}

		return processedContent;
	}

	/**
	 * Calculate relative path from notes folder to target folder
	 */
	private calculateRelativePath(notesFolder: string, targetFolder: string): string {
		const notesParts = notesFolder.split('/');
		const targetParts = targetFolder.split('/');

		// Find common prefix
		let commonIndex = 0;
		while (
			commonIndex < notesParts.length &&
			commonIndex < targetParts.length &&
			notesParts[commonIndex] === targetParts[commonIndex]
		) {
			commonIndex++;
		}

		// Go up from notes folder
		const upLevels = notesParts.length - commonIndex;
		const upPath = '../'.repeat(upLevels);

		// Go down to target folder
		const downPath = targetParts.slice(commonIndex).join('/');

		return upPath + (downPath ? downPath + '/' : '');
	}

	async rewriteCurrentNote(file: TFile): Promise<void> {
		try {
			new Notice('AI layout fixing in progress...', NOTICE_TIMEOUTS.medium);
			
			// Read the current file content
			const content = await this.app.vault.read(file);
			
			// Extract frontmatter and body using Obsidian API
			const frontMatterInfo = getFrontMatterInfo(content);
			const frontmatter = frontMatterInfo.frontmatter;
			const body = frontMatterInfo.exists 
				? content.substring(frontMatterInfo.contentStart).trim()
				: content;
			
			// Clean the body content for AI processing
			const cleanBody = ContentUtils.cleanContentForAI(body);
			
			if (!ContentUtils.isContentValidForAI(cleanBody)) {
				new Notice('Content too short for AI formatting (minimum 50 characters)');
				return;
			}

			// Call AI for layout fixing
			const fixedContent = await this.aiService.callAIForLayoutFix(cleanBody);
			
			if (!fixedContent) {
				new Notice('AI formatting failed. Please try again.');
				return;
			}

			// Reconstruct the file with fixed content
			const newContent = frontMatterInfo.exists
				? `---\n${frontmatter}\n---\n${fixedContent}`
				: fixedContent;

			// Write the fixed content back to the file
			await this.app.vault.modify(file, newContent);
			
			new Notice('Layout and formatting fixed by AI', NOTICE_TIMEOUTS.medium);
			
		} catch (error) {
			
			// Provide specific error messages
			if (error.message.includes('401')) {
				new Notice('Invalid OpenAI API key', 8000);
				new Notice('Please check your API key in plugin settings', NOTICE_TIMEOUTS.medium);
			} else if (error.message.includes('quota')) {
				new Notice('OpenAI API quota exceeded', 8000);
				new Notice('Please check your OpenAI billing settings', NOTICE_TIMEOUTS.medium);
			} else if (error.message.includes('network')) {
				new Notice('Network error - please check your connection', NOTICE_TIMEOUTS.medium);
			} else {
				new Notice(`AI formatting failed: ${error.message}`, 8000);
			}
		}
	}

	async callAIForLayoutFix(content: string): Promise<string> {
		return await this.aiService.callAIForLayoutFix(content);
	}

	async deleteNoteWithImages(file: TFile): Promise<void> {
		try {
			// Read the file content
			const content = await this.app.vault.read(file);

			// Extract image paths from markdown content
			// Matches: ![alt](path) and ![[path]]
			const imagePaths: string[] = [];

			// Standard markdown images: ![alt](path)
			const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
			let match;
			while ((match = markdownImageRegex.exec(content)) !== null) {
				const imagePath = match[2];
				// Only include relative paths (not URLs)
				if (!imagePath.startsWith('http://') && !imagePath.startsWith('https://')) {
					imagePaths.push(imagePath);
				}
			}

			// Obsidian wiki-style images: ![[path]]
			const wikiImageRegex = /!\[\[([^\]]+)\]\]/g;
			while ((match = wikiImageRegex.exec(content)) !== null) {
				const imagePath = match[1].split('|')[0]; // Remove any alias after |
				imagePaths.push(imagePath);
			}

			// Delete images
			let deletedImageCount = 0;
			const noteFolder = file.parent?.path || '';
			const imageFolder = this.settings.imageFolder;

			for (const imagePath of imagePaths) {
				try {
					// Try multiple path resolution strategies
					const pathsToTry: string[] = [];

					// 1. If path starts with attachments/, replace with imageFolder setting
					if (imagePath.startsWith('attachments/')) {
						const filename = imagePath.substring('attachments/'.length);
						pathsToTry.push(normalizePath(`${imageFolder}/${filename}`));
					}

					// 2. Relative to note's folder
					if (!imagePath.startsWith('/')) {
						pathsToTry.push(normalizePath(`${noteFolder}/${imagePath}`));
					}

					// 3. Relative to imageFolder setting (image filename only)
					const imageFilename = imagePath.split('/').pop() || imagePath;
					pathsToTry.push(normalizePath(`${imageFolder}/${imageFilename}`));

					// 4. As-is (absolute or vault-relative path)
					pathsToTry.push(normalizePath(imagePath));

					// Try each path until we find the file
					for (const tryPath of pathsToTry) {
						const imageFile = this.app.vault.getAbstractFileByPath(tryPath);
						if (imageFile instanceof TFile) {
							await this.app.fileManager.trashFile(imageFile);
							deletedImageCount++;
							break; // Found and deleted, move to next image
						}
					}
				} catch {
					// Image file not found or couldn't be deleted, continue
				}
			}

			// Delete the note itself
			await this.app.fileManager.trashFile(file);

			// Show result notice
			if (deletedImageCount > 0) {
				new Notice(this.i18n.t('notices.note_deleted', { count: String(deletedImageCount) }), NOTICE_TIMEOUTS.medium);
			} else {
				new Notice(this.i18n.t('notices.note_deleted_no_images'), NOTICE_TIMEOUTS.medium);
			}

		} catch (error) {
			new Notice(this.i18n.t('notices.delete_failed', { error: error.message }), NOTICE_TIMEOUTS.medium);
		}
	}
}