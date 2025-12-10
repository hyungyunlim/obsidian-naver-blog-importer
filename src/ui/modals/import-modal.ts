import { App, Modal, Notice, TFile } from 'obsidian';
import { NaverBlogFetcher } from '../../../naver-blog-fetcher';
import { NaverCafeFetcher } from '../../fetchers/naver-cafe-fetcher';
import { NaverNewsFetcher } from '../../fetchers/naver-news-fetcher';
import { ImageService } from '../../services/image-service';
import { UI_DEFAULTS, NOTICE_TIMEOUTS, parseCafeUrl } from '../../constants';
import { isNaverBlogUrl, parseNaverBlogUrl, extractBlogIdFromUrl } from '../../utils/url-utils';
import type NaverBlogPlugin from '../../../main';
import type { ProcessedCafePost } from '../../types';

export class NaverBlogImportModal extends Modal {
	plugin: NaverBlogPlugin;

	constructor(app: App, plugin: NaverBlogPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Import from Naver' });

		const inputContainer = contentEl.createDiv({ cls: 'naver-blog-input-container' });

		const input = inputContainer.createEl('input', {
			type: 'text',
			placeholder: 'Blog/Cafe/News URL (blog.naver.com, cafe.naver.com, n.news.naver.com)',
			cls: 'naver-blog-input'
		});

		const detectionDiv = inputContainer.createDiv({ cls: 'naver-blog-detection' });
		detectionDiv.style.marginTop = '8px';
		detectionDiv.style.fontSize = '12px';
		detectionDiv.style.color = 'var(--text-muted)';

		// Update detection status on input
		const updateDetection = () => {
			const value = input.value.trim();
			if (!value) {
				detectionDiv.empty();
				return;
			}

			const detection = this.detectInputType(value);
			detectionDiv.empty();

			const icon = detection.type === 'single' ? '📄' :
						 detection.type === 'bulk' ? '📚' :
						 detection.type === 'cafe' ? '☕' :
						 detection.type === 'news' ? '📰' : '⚠️';
			detectionDiv.setText(`${icon} ${detection.message}`);
			detectionDiv.style.color = detection.type === 'invalid' ?
				'var(--text-error)' : 'var(--text-muted)';
		};

		input.addEventListener('input', updateDetection);

		const buttonContainer = contentEl.createDiv({ cls: 'naver-blog-button-container' });

		const cancelButton = buttonContainer.createEl('button', {
			text: this.plugin.i18n.t('modals.import_single_post.cancel_button')
		});
		cancelButton.addEventListener('click', () => this.close());

		const importButton = buttonContainer.createEl('button', {
			text: this.plugin.i18n.t('modals.import_blog_url.import_button'),
			cls: 'mod-cta'
		});

		importButton.addEventListener('click', () => {
			void this.handleImport(input.value.trim());
		});

		// Enter key to import
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				importButton.click();
			}
		});

		// Focus and auto-fill from clipboard
		setTimeout(async () => {
			input.focus();

			try {
				const clipboardText = await navigator.clipboard.readText();
				if (clipboardText && (isNaverBlogUrl(clipboardText) || this.isNaverCafeUrl(clipboardText) || this.isNaverNewsUrl(clipboardText))) {
					input.value = clipboardText.trim();
					input.select();
					updateDetection();
				}
			} catch {
				// Clipboard access denied - silently ignore
			}
		}, UI_DEFAULTS.modalTimeout);
	}

	isNaverCafeUrl(value: string): boolean {
		return value.includes('cafe.naver.com');
	}

	isNaverNewsUrl(value: string): boolean {
		return value.includes('n.news.naver.com') || value.includes('m.news.naver.com') || value.includes('news.naver.com/article');
	}

	detectInputType(value: string): { type: 'single' | 'bulk' | 'cafe' | 'news' | 'invalid'; message: string } {
		// Check for News URL first
		if (this.isNaverNewsUrl(value)) {
			const newsMatch = value.match(/article\/(\d+)\/(\d+)/);
			if (newsMatch) {
				const [, oid, aid] = newsMatch;
				return {
					type: 'news',
					message: `📰 News article (oid: ${oid}, aid: ${aid})`
				};
			}
			return { type: 'invalid', message: 'Could not parse news article ID from URL' };
		}

		// Check for Cafe URL
		if (this.isNaverCafeUrl(value)) {
			const parsed = parseCafeUrl(value);
			if (parsed && parsed.articleId) {
				const cafeIdentifier = parsed.cafeUrl || parsed.cafeId || 'unknown';
				return {
					type: 'cafe',
					message: `☕ Cafe article from "${cafeIdentifier}" (articleId: ${parsed.articleId})`
				};
			}
			return { type: 'invalid', message: 'Could not parse cafe article ID from URL' };
		}

		// Check for Blog URL
		if (isNaverBlogUrl(value)) {
			const parsed = parseNaverBlogUrl(value);
			if (parsed) {
				return {
					type: 'single',
					message: `Single post from "${parsed.blogId}" (logNo: ${parsed.logNo})`
				};
			}
			const blogId = extractBlogIdFromUrl(value);
			if (blogId) {
				return {
					type: 'bulk',
					message: `All posts from "${blogId}"`
				};
			}
			return { type: 'invalid', message: 'Invalid URL format' };
		}

		const blogId = value.replace(/[^a-zA-Z0-9_-]/g, '');
		if (blogId) {
			return {
				type: 'bulk',
				message: `All posts from "${blogId}"`
			};
		}
		return { type: 'invalid', message: 'Invalid blog ID' };
	}

	async handleImport(inputValue: string) {
		if (!inputValue) {
			new Notice('Please enter a blog ID or URL');
			return;
		}

		this.close();

		// Check for News URL first
		if (this.isNaverNewsUrl(inputValue)) {
			const newsMatch = inputValue.match(/article\/(\d+)\/(\d+)/);
			if (newsMatch) {
				const [, oid, aid] = newsMatch;
				await this.importNewsArticle(inputValue, oid, aid);
			} else {
				new Notice('Invalid Naver News URL. Please include the article ID.');
			}
			return;
		}

		// Check for Cafe URL
		if (this.isNaverCafeUrl(inputValue)) {
			const parsed = parseCafeUrl(inputValue);
			if (parsed && parsed.articleId) {
				const cafeIdentifier = parsed.cafeUrl || parsed.cafeId;
				if (cafeIdentifier) {
					await this.importCafeArticle(cafeIdentifier, parsed.articleId);
				} else {
					new Notice('Could not extract cafe identifier from URL');
				}
			} else {
				new Notice('Invalid Naver Cafe URL. Please include the article ID.');
			}
			return;
		}

		// Check if it's a blog post URL or just a blog ID
		if (isNaverBlogUrl(inputValue)) {
			// Try to parse as single post URL first
			const parsed = parseNaverBlogUrl(inputValue);
			if (parsed) {
				await this.importSinglePost(parsed.blogId, parsed.logNo);
			} else {
				// No logNo found - try to extract blogId for bulk import
				// e.g., https://blog.naver.com/iluvssang/
				const blogId = extractBlogIdFromUrl(inputValue);
				if (blogId) {
					await this.importAllPosts(blogId);
				} else {
					new Notice('Invalid Naver blog URL format');
				}
			}
		} else {
			// Bulk import - treat as blog ID
			const blogId = inputValue.replace(/[^a-zA-Z0-9_-]/g, '');
			if (blogId) {
				await this.importAllPosts(blogId);
			} else {
				new Notice('Invalid blog ID');
			}
		}
	}

	async importCafeArticle(cafeIdOrUrl: string, articleId: string) {
		try {
			const cookie = this.plugin.settings.cafeSettings?.naverCookie || '';

			// Warn if no cookie is set
			if (!cookie) {
				new Notice('⚠️ 네이버 쿠키가 설정되지 않았습니다. 비공개 카페의 경우 가져오기가 실패할 수 있습니다.', NOTICE_TIMEOUTS.medium);
			}

			new Notice(`Importing cafe article...`, NOTICE_TIMEOUTS.short);

			const fetcher = new NaverCafeFetcher(cafeIdOrUrl, cookie);
			const article = await fetcher.fetchSingleArticle(articleId);

			if (!article) {
				new Notice('Failed to fetch cafe article', NOTICE_TIMEOUTS.medium);
				return;
			}

			// Convert to ProcessedCafePost
			const processedPost: ProcessedCafePost = {
				title: article.title.replace(/^\[.*?\]\s*/, '').replace(/\s*\[.*?\]$/, '').trim(),
				content: article.content,
				date: article.writeDate,
				articleId: article.articleId,
				cafeId: article.cafeId,
				cafeName: article.cafeName || '',
				cafeUrl: cafeIdOrUrl,
				menuId: article.menuId,
				menuName: article.menuName || '',
				author: article.writerNickname,
				url: article.url,
				tags: article.tags,
				excerpt: article.content.substring(0, 150).replace(/\n/g, ' ') + '...',
				viewCount: article.viewCount,
				commentCount: article.commentCount,
				comments: article.comments,
			};

			const createdFile = await this.plugin.createCafeMarkdownFile(processedPost);

			new Notice(`✅ Imported: "${processedPost.title}"`, NOTICE_TIMEOUTS.medium);

			if (createdFile) {
				await this.openFile(createdFile);
			}
		} catch (error) {
			new Notice(`❌ Import failed: ${error.message}`, NOTICE_TIMEOUTS.medium);
		}
	}

	async importNewsArticle(url: string, oid: string, aid: string) {
		try {
			new Notice(`📰 Importing news article...`, NOTICE_TIMEOUTS.short);

			const newsSettings = this.plugin.settings.newsSettings;
			if (!newsSettings) {
				new Notice('News settings not configured', NOTICE_TIMEOUTS.medium);
				return;
			}

			const fetcher = new NaverNewsFetcher(this.plugin.app, newsSettings);
			const article = await fetcher.fetchArticle(url);

			if (!article) {
				new Notice('Failed to fetch news article', NOTICE_TIMEOUTS.medium);
				return;
			}

			const filePath = await fetcher.saveArticle(article);

			new Notice(`✅ Imported: "${article.title}"`, NOTICE_TIMEOUTS.medium);

			if (filePath) {
				const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
				if (file instanceof TFile) {
					await this.openFile(file);
				}
			}
		} catch (error) {
			new Notice(`❌ Import failed: ${error.message}`, NOTICE_TIMEOUTS.medium);
		}
	}

	async importSinglePost(blogId: string, logNo: string) {
		try {
			new Notice(`Importing post from ${blogId}...`, NOTICE_TIMEOUTS.short);

			const fetcher = new NaverBlogFetcher(blogId);
			const post = await fetcher.fetchSinglePost(logNo);

			if (!post) {
				new Notice('Failed to fetch post', NOTICE_TIMEOUTS.medium);
				return;
			}

			const createdFile = await this.plugin.createMarkdownFile({
				...post,
				tags: post.originalTags.length > 0 ? post.originalTags : [],
				excerpt: post.content.substring(0, 150) + '...'
			});

			new Notice(`✅ Imported: "${post.title}"`, NOTICE_TIMEOUTS.medium);

			// Open the created file
			if (createdFile) {
				await this.openFile(createdFile);
			}
		} catch (error) {
			new Notice(`❌ Import failed: ${error.message}`, NOTICE_TIMEOUTS.medium);
		}
	}

	async importAllPosts(blogId: string) {
		let importCancelled = false;
		const cancelNotice = new Notice("Click here to cancel import", 0);
		// @ts-ignore - accessing private messageEl property
		const messageEl = cancelNotice.messageEl;
		if (messageEl) {
			messageEl.addEventListener('click', () => {
				importCancelled = true;
				cancelNotice.hide();
				new Notice("Import cancelled by user", NOTICE_TIMEOUTS.medium);
			});
		}

		try {
			new Notice(`Fetching posts from ${blogId}...`);

			const posts = await this.plugin.fetchNaverBlogPosts(blogId);

			if (posts.length === 0) {
				cancelNotice.hide();
				new Notice("No posts found or failed to fetch posts");
				return;
			}

			let successCount = 0;
			let errorCount = 0;
			let errorLogCount = 0;
			let lastCreatedFile: TFile | null = null;
			const totalPosts = posts.length;

			for (let i = 0; i < posts.length; i++) {
				if (importCancelled) break;

				const post = posts[i];
				const progress = `(${i + 1}/${totalPosts})`;
				const isErrorPost = post.title.startsWith('[오류]');

				try {
					new Notice(`Creating file ${progress}: ${post.title}`, 3000);
					const createdFile = await this.plugin.createMarkdownFile(post);

					if (createdFile) {
						lastCreatedFile = createdFile;
					}

					if (isErrorPost) {
						errorLogCount++;
					} else {
						successCount++;
					}
				} catch {
					// Failed to create markdown file for this post
					errorCount++;
				}
				await new Promise(resolve => setTimeout(resolve, 500));
			}

			cancelNotice.hide();

			let summary = importCancelled ?
				`Import cancelled: ${successCount} successful` :
				`Import complete: ${successCount} successful`;

			if (errorLogCount > 0) summary += `, ${errorLogCount} error logs`;
			if (errorCount > 0) summary += `, ${errorCount} errors`;

			const processed = successCount + errorLogCount + errorCount;
			summary += ` (${processed}/${totalPosts})`;

			if (!importCancelled && errorCount === 0) summary += ' ✅';
			else if (errorCount > 0) summary += ' ⚠️';

			new Notice(summary, 8000);

			// Open the last created file after import completes
			if (lastCreatedFile && !importCancelled) {
				await this.openFile(lastCreatedFile);
			}
		} catch {
			// Import process failed
			cancelNotice.hide();
			new Notice("Import failed. Check console for details.");
		}
	}

	async openFile(file: TFile) {
		// Use plugin.app since modal may be closed
		const leaf = this.plugin.app.workspace.getLeaf(false);
		await leaf.openFile(file, { active: true });
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
