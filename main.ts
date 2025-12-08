import {
	Plugin,
	Notice,
	TFile,
	normalizePath,
	getFrontMatterInfo
} from 'obsidian';

import { I18n } from './src/utils/i18n';
import { AIService } from './src/services/ai-service';
import { BlogService } from './src/services/blog-service';
import { ImageService } from './src/services/image-service';
import { NaverBlogImportModal } from './src/ui/modals/import-modal';
import { NaverBlogSubscribeModal } from './src/ui/modals/subscribe-modal';
import { NaverCafeImportModal } from './src/ui/modals/cafe-import-modal';
import { NaverBlogSettingTab } from './src/ui/settings-tab';
import { LocaleUtils } from './src/utils/locale-utils';
import { ContentUtils } from './src/utils/content-utils';
import { SettingsUtils } from './src/utils/settings-utils';
import { APIClientFactory } from './src/api';
import {
	NaverBlogSettings,
	DEFAULT_SETTINGS,
	DEFAULT_CAFE_SETTINGS,
	ProcessedBlogPost,
	ProcessedCafePost
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
	imageService: ImageService;
	
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

		// Fetch models from APIs in background
		void this.refreshModels().catch(() => {
			// Silently ignore startup model refresh errors
		});

		// Add ribbon icon
		this.addRibbonIcon('download', 'Import naver blog', (evt: MouseEvent) => {
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

		// Cafe import command
		this.addCommand({
			id: 'import-naver-cafe',
			name: 'Import from Naver Cafe',
			callback: () => {
				new NaverCafeImportModal(this.app, this).open();
			}
		});

		// Auto-sync subscribed blogs on startup
		if (this.settings.subscribedBlogs.length > 0) {
			setTimeout(() => void this.blogService.syncSubscribedBlogs(), UI_DELAYS.autoSync);
		}

		// Add settings tab
		this.addSettingTab(new NaverBlogSettingTab(this.app, this));
	}

	onunload() {
		// Cleanup if needed
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
	}

	async saveSettings() {
		// Validate and normalize settings
		this.settings = SettingsUtils.validateAndNormalizeSettings(this.settings);
		
		await this.saveData(this.settings);
		// Update services when settings change
		this.aiService = new AIService(this.settings);
		this.blogService.updateSettings(this.settings);
		this.imageService.updateSettings(this.settings);
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
			// Generate AI tags and excerpt if enabled
			if (this.settings.enableAiTags) {
				post.tags = await this.generateAITags(post.title, post.content);
			}

			if (this.settings.enableAiExcerpt) {
				// Add small delay between AI calls to avoid rate limiting
				if (this.settings.enableAiTags) {
					await new Promise(resolve => setTimeout(resolve, API_DELAYS.betweenPosts));
				}
				post.excerpt = await this.generateAIExcerpt(post.title, post.content);
			}

			// Process images if enabled
			let processedContent = post.content;
			if (this.settings.enableImageDownload) {
				processedContent = await this.imageService.downloadAndProcessImages(post.content, post.logNo);
			}

			// Create filename - just title.md without date prefix and hyphen replacements
			const filename = this.imageService.sanitizeFilename(`${post.title}.md`);
			const baseFolder = normalizePath(this.settings.defaultFolder || DEFAULT_SETTINGS.defaultFolder);
			// Store posts under blogId subfolder
			const folder = normalizePath(`${baseFolder}/${post.blogId}`);

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
							await this.app.vault.delete(imageFile);
							deletedImageCount++;
							break; // Found and deleted, move to next image
						}
					}
				} catch {
					// Image file not found or couldn't be deleted, continue
				}
			}

			// Delete the note itself
			await this.app.vault.delete(file);

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