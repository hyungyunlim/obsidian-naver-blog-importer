import { App, Modal, Notice, TFile, Setting } from 'obsidian';
import { NaverBlogFetcher } from '../../../naver-blog-fetcher';
import { BrunchFetcher, BrunchKeywordFetcher, BrunchBookFetcher } from '../../../brunch-fetcher';
import { NaverCafeFetcher } from '../../fetchers/naver-cafe-fetcher';
import { NaverNewsFetcher } from '../../fetchers/naver-news-fetcher';
import { UI_DEFAULTS, NOTICE_TIMEOUTS, parseCafeUrl, BRUNCH_URL_PATTERNS } from '../../constants';
import { isNaverBlogUrl, parseNaverBlogUrl, extractBlogIdFromUrl } from '../../utils/url-utils';
import type NaverBlogPlugin from '../../../main';
import type { ProcessedCafePost } from '../../types';

export class NaverBlogImportModal extends Modal {
	plugin: NaverBlogPlugin;
	private postCountInput: HTMLInputElement | null = null;
	private shouldSubscribe: boolean = false;

	constructor(app: App, plugin: NaverBlogPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl, modalEl } = this;
		contentEl.empty();

		// Add modal class for styling
		modalEl.addClass('naver-import-modal');

		// Title
		contentEl.createEl('h2', {
			text: 'Import from Naver / Brunch',
			cls: 'naver-import-modal-title'
		});

		// URL Input container
		const inputContainer = contentEl.createDiv({ cls: 'naver-import-url-container' });

		const input = inputContainer.createEl('input', {
			type: 'text',
			placeholder: 'Paste URL (blog.naver.com, cafe.naver.com, brunch.co.kr)',
			cls: 'naver-import-url-input'
		});

		// Platform detection badge
		const detectionDiv = inputContainer.createDiv({ cls: 'naver-import-platform-badge' });

		// Options container (shown for bulk imports like Brunch author/keyword)
		const optionsContainer = contentEl.createDiv({ cls: 'naver-import-options-container' });
		optionsContainer.style.display = 'none';

		// Post count setting item
		const postCountItem = optionsContainer.createDiv({ cls: 'setting-item' });
		const postCountInfo = postCountItem.createDiv({ cls: 'setting-item-info' });
		postCountInfo.createDiv({ cls: 'setting-item-name', text: 'Max posts' });
		postCountInfo.createDiv({ cls: 'setting-item-description', text: 'Leave empty to import all posts' });
		const postCountControl = postCountItem.createDiv({ cls: 'setting-item-control' });
		this.postCountInput = postCountControl.createEl('input', {
			type: 'number',
			placeholder: 'All'
		});
		this.postCountInput.style.width = '80px';
		this.postCountInput.min = '1';
		this.postCountInput.max = '1000';

		// Subscribe toggle using Obsidian's Setting API
		new Setting(optionsContainer)
			.setName('Add to subscriptions')
			.setDesc('Auto-sync new posts in the future')
			.addToggle(toggle => toggle
				.setValue(this.shouldSubscribe)
				.onChange(value => {
					this.shouldSubscribe = value;
				}));

		// Update detection status on input
		const updateDetection = () => {
			const value = input.value.trim();
			if (!value) {
				detectionDiv.empty();
				optionsContainer.style.display = 'none';
				return;
			}

			const detection = this.detectInputType(value);
			detectionDiv.empty();

			const icon = detection.type === 'single' ? '📄' :
						 detection.type === 'bulk' ? '📚' :
						 detection.type === 'cafe' ? '☕' :
						 detection.type === 'news' ? '📰' :
						 detection.type === 'brunch' ? '🥐' : '⚠️';
			detectionDiv.setText(`${icon} ${detection.message}`);
			detectionDiv.removeClass('naver-import-platform-badge--error');
			detectionDiv.removeClass('naver-import-platform-badge--valid');
			if (detection.type === 'invalid') {
				detectionDiv.addClass('naver-import-platform-badge--error');
			} else {
				detectionDiv.addClass('naver-import-platform-badge--valid');
			}

			// Show options for bulk imports (Naver blog bulk or Brunch author/keyword pages)
			const showOptions = detection.type === 'bulk' ||
				(detection.type === 'brunch' && (detection.message.includes('all posts') || detection.message.includes('(all posts)')));
			optionsContainer.style.display = showOptions ? 'block' : 'none';
		};

		input.addEventListener('input', updateDetection);

		const buttonContainer = contentEl.createDiv({ cls: 'naver-import-button-container' });

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
		setTimeout(() => {
			input.focus();

			navigator.clipboard.readText().then((clipboardText) => {
				if (clipboardText && (isNaverBlogUrl(clipboardText) || this.isNaverCafeUrl(clipboardText) || this.isNaverNewsUrl(clipboardText) || this.isBrunchUrl(clipboardText))) {
					input.value = clipboardText.trim();
					input.select();
					updateDetection();
				}
			}).catch(() => {
				// Clipboard access denied - silently ignore
			});
		}, UI_DEFAULTS.modalTimeout);
	}

	isNaverCafeUrl(value: string): boolean {
		return value.includes('cafe.naver.com');
	}

	isNaverNewsUrl(value: string): boolean {
		return value.includes('n.news.naver.com') || value.includes('m.news.naver.com') || value.includes('news.naver.com/article');
	}

	isBrunchUrl(value: string): boolean {
		// Check for brunch.co.kr with or without @ (mobile may strip @)
		return value.includes('brunch.co.kr');
	}

	/**
	 * Try to fix Brunch URL if @ is missing (mobile issue)
	 * e.g., "brunch.co.kr/whyart/170" -> "brunch.co.kr/@whyart/170"
	 */
	fixBrunchUrl(value: string): string {
		if (!value.includes('brunch.co.kr')) return value;

		// If already has @, return as-is
		if (value.includes('@')) return value;

		// Don't add @ for keyword, brunchbook, or other special paths
		if (value.includes('/keyword/') || value.includes('/brunchbook/') || value.includes('/now') || value.includes('/publish')) {
			return value;
		}

		// Try to add @ after brunch.co.kr/ for author pages
		// Pattern: brunch.co.kr/username/postId or brunch.co.kr/username
		return value.replace(
			/(brunch\.co\.kr)\//,
			'$1/@'
		);
	}

	/**
	 * Normalize URL to handle mobile-specific encoding issues
	 * Removes invisible characters, normalizes Unicode, converts full-width to ASCII
	 */
	normalizeUrl(value: string): string {
		if (!value) return '';

		// Remove zero-width characters and other invisible Unicode
		let normalized = value
			.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '') // Zero-width spaces, NBSP
			.replace(/[\u2028\u2029]/g, '') // Line/paragraph separators
			.replace(/\s+/g, ' ') // Normalize whitespace
			.trim();

		// Normalize Unicode (NFC form)
		if (normalized.normalize) {
			normalized = normalized.normalize('NFC');
		}

		// Convert full-width characters to ASCII (iOS smart punctuation issue)
		// Full-width ASCII variants: U+FF01 to U+FF5E map to U+0021 to U+007E
		normalized = normalized.replace(/[\uFF01-\uFF5E]/g, (char) => {
			return String.fromCharCode(char.charCodeAt(0) - 0xFEE0);
		});

		// Convert other common smart punctuation
		normalized = normalized
			.replace(/['']/g, "'")  // Smart single quotes
			.replace(/[""]/g, '"')  // Smart double quotes
			.replace(/[–—]/g, '-')  // En-dash, em-dash
			.replace(/…/g, '...')   // Ellipsis
			.replace(/：/g, ':')    // Full-width colon
			.replace(/／/g, '/')    // Full-width slash
			.replace(/．/g, '.')    // Full-width period
			.replace(/＠/g, '@');   // Full-width at sign

		return normalized;
	}

	detectInputType(value: string): { type: 'single' | 'bulk' | 'cafe' | 'news' | 'brunch' | 'invalid'; message: string } {
		// Normalize URL to handle mobile-specific encoding issues
		value = this.normalizeUrl(value);
		// Fix Brunch URL if @ is missing (mobile may strip @)
		value = this.fixBrunchUrl(value);

		// Check for Brunch URL first
		if (this.isBrunchUrl(value)) {
			// Check for brunchbook URL first
			if (BrunchFetcher.isBookUrl(value)) {
				const bookId = BrunchFetcher.parseBookUrl(value);
				if (bookId) {
					return {
						type: 'brunch',
						message: `📖 Brunch book "${bookId}" (all posts)`
					};
				}
			}

			// Check for keyword/magazine URL
			if (BrunchFetcher.isKeywordUrl(value)) {
				const keyword = BrunchFetcher.parseKeywordUrl(value);
				if (keyword) {
					return {
						type: 'brunch',
						message: `🏷️ Brunch keyword "${keyword}" (all posts)`
					};
				}
			}

			const parsed = BrunchFetcher.parsePostUrl(value);
			if (parsed) {
				return {
					type: 'brunch',
					message: `🥐 Brunch post from @${parsed.username} (ID: ${parsed.postId})`
				};
			}
			// Author page without post ID
			const authorMatch = value.match(/@([^/]+)$/);
			if (authorMatch) {
				return {
					type: 'brunch',
					message: `🥐 Brunch author @${authorMatch[1]} (all posts)`
				};
			}
			return { type: 'invalid', message: 'Could not parse Brunch URL' };
		}

		// Check for News URL first
		if (this.isNaverNewsUrl(value)) {
			const newsMatch = value.match(/article\/(\d+)\/(\d+)/);
			if (newsMatch) {
				const [, oid, aid] = newsMatch;
				return {
					type: 'news',
					message: `📰 News article (OID: ${oid}, AID: ${aid})`
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
					message: `☕ Cafe article from "${cafeIdentifier}" (article ID: ${parsed.articleId})`
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

		// Get max posts value before closing modal
		const maxPostsValue = this.postCountInput?.value;
		const maxPosts = maxPostsValue ? parseInt(maxPostsValue, 10) : undefined;
		const shouldSubscribe = this.shouldSubscribe;

		// Normalize URL to handle mobile-specific encoding issues
		inputValue = this.normalizeUrl(inputValue);

		// Fix Brunch URL if @ is missing (mobile may strip @)
		inputValue = this.fixBrunchUrl(inputValue);

		this.close();

		// Check for Brunch URL first
		if (this.isBrunchUrl(inputValue)) {
			// Check for brunchbook URL first
			if (BrunchFetcher.isBookUrl(inputValue)) {
				const bookId = BrunchFetcher.parseBookUrl(inputValue);
				if (bookId) {
					await this.importBrunchBook(bookId, maxPosts);
				} else {
					new Notice('Invalid Brunch book URL format');
				}
				return;
			}

			// Check for keyword/magazine URL
			if (BrunchFetcher.isKeywordUrl(inputValue)) {
				const keyword = BrunchFetcher.parseKeywordUrl(inputValue);
				if (keyword) {
					await this.importBrunchKeyword(keyword, maxPosts);
				} else {
					new Notice('Invalid Brunch keyword URL format');
				}
				return;
			}

			const parsed = BrunchFetcher.parsePostUrl(inputValue);
			if (parsed) {
				await this.importBrunchPost(parsed.username, parsed.postId);
			} else {
				// Author page - import all posts
				const authorMatch = inputValue.match(/@([^/]+)/);
				if (authorMatch) {
					await this.importBrunchAuthor(authorMatch[1], maxPosts, shouldSubscribe);
				} else {
					new Notice('Invalid Brunch URL format');
				}
			}
			return;
		}

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
					await this.importAllPosts(blogId, maxPosts, shouldSubscribe);
				} else {
					new Notice('Invalid Naver Blog URL format');
				}
			}
		} else {
			// Bulk import - treat as blog ID
			const blogId = inputValue.replace(/[^a-zA-Z0-9_-]/g, '');
			if (blogId) {
				await this.importAllPosts(blogId, maxPosts, shouldSubscribe);
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
				contentHtml: article.contentHtml, // 비디오 추출용 원본 HTML
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
				new Notice('News settings not configured.', NOTICE_TIMEOUTS.medium);
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

	async importAllPosts(blogId: string, maxPosts?: number, shouldSubscribe?: boolean) {
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
			const limitText = maxPosts ? ` (max ${maxPosts})` : '';
			new Notice(`Fetching posts from ${blogId}${limitText}...`);

			const posts = await this.plugin.fetchNaverBlogPosts(blogId, maxPosts);

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

			// Add to subscriptions if requested (even if no new posts due to duplicates)
			if (shouldSubscribe && !importCancelled) {
				const existing = this.plugin.settings.subscribedBlogs.includes(blogId);
				if (!existing) {
					// Fetch profile info for rich metadata
					new Notice(`Fetching blog profile...`, 2000);
					const profile = await NaverBlogFetcher.fetchProfileInfoStatic(blogId);

					this.plugin.settings.subscribedBlogs.push(blogId);
					this.plugin.settings.blogSubscriptions.push({
						id: `naver-${blogId}-${Date.now()}`,
						blogId: blogId,
						blogName: profile.nickname,
						profileImageUrl: profile.profileImageUrl,
						bio: profile.bio,
						postCount: maxPosts || 10,
						createdAt: new Date().toISOString()
					});
					await this.plugin.saveSettings();
					new Notice(`Added ${profile.nickname} (${blogId}) to subscriptions`, 3000);
				}
			}

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

	async importBrunchPost(username: string, postId: string) {
		try {
			new Notice(`🥐 Importing Brunch post from @${username}...`, NOTICE_TIMEOUTS.short);

			const fetcher = new BrunchFetcher(username);
			const post = await fetcher.fetchSinglePost(postId);

			if (!post) {
				new Notice('Failed to fetch Brunch post', NOTICE_TIMEOUTS.medium);
				return;
			}

			const createdFile = await this.plugin.createBrunchMarkdownFile(post);

			new Notice(`✅ Imported: "${post.title}"`, NOTICE_TIMEOUTS.medium);

			if (createdFile) {
				await this.openFile(createdFile);
			}
		} catch (error) {
			new Notice(`❌ Brunch import failed: ${error.message}`, NOTICE_TIMEOUTS.medium);
		}
	}

	async importBrunchAuthor(username: string, maxPosts?: number, shouldSubscribe?: boolean) {
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
			const limitText = maxPosts ? ` (max ${maxPosts})` : '';
			new Notice(`🥐 Fetching posts from @${username}${limitText}...`);

			const fetcher = new BrunchFetcher(username);
			const posts = await fetcher.fetchPosts(maxPosts);

			if (posts.length === 0) {
				cancelNotice.hide();
				new Notice("No posts found or failed to fetch posts");
				return;
			}

			let successCount = 0;
			let errorCount = 0;
			let lastCreatedFile: TFile | null = null;
			const totalPosts = posts.length;

			for (let i = 0; i < posts.length; i++) {
				if (importCancelled) break;

				const post = posts[i];
				const progress = `(${i + 1}/${totalPosts})`;

				try {
					new Notice(`Creating file ${progress}: ${post.title}`, 3000);
					const createdFile = await this.plugin.createBrunchMarkdownFile(post);

					if (createdFile) {
						lastCreatedFile = createdFile;
					}
					successCount++;
				} catch {
					errorCount++;
				}
				await new Promise(resolve => setTimeout(resolve, 500));
			}

			cancelNotice.hide();

			let summary = importCancelled ?
				`Import cancelled: ${successCount} successful` :
				`Import complete: ${successCount} successful`;

			if (errorCount > 0) summary += `, ${errorCount} errors`;

			const processed = successCount + errorCount;
			summary += ` (${processed}/${totalPosts})`;

			if (!importCancelled && errorCount === 0) summary += ' ✅';
			else if (errorCount > 0) summary += ' ⚠️';

			new Notice(summary, 8000);

			// Add to subscriptions if requested (even if no new posts due to duplicates)
			if (shouldSubscribe && !importCancelled) {
				const existing = this.plugin.settings.brunchSettings?.subscribedBrunchAuthors?.find(
					sub => sub.authorUsername === username
				);
				if (!existing) {
					if (!this.plugin.settings.brunchSettings) {
						this.plugin.settings.brunchSettings = {
							brunchImportFolder: 'Brunch Posts',
							downloadBrunchImages: true,
							downloadBrunchVideos: true,
							downloadBrunchComments: true,
							subscribedBrunchAuthors: [],
							enableBrunchDuplicateCheck: true
						};
					}
					if (!this.plugin.settings.brunchSettings.subscribedBrunchAuthors) {
						this.plugin.settings.brunchSettings.subscribedBrunchAuthors = [];
					}

					// Fetch author profile for rich metadata
					new Notice(`Fetching author profile...`, 2000);
					const profile = await BrunchFetcher.fetchAuthorProfile(username);

					const newSubscription = {
						id: `brunch-${username}-${Date.now()}`,
						platform: 'brunch' as const,
						authorUsername: username,
						authorName: profile.authorName,
						authorTitle: profile.authorTitle,
						authorDescription: profile.authorDescription,
						profileImageUrl: profile.profileImageUrl,
						subscriberCount: profile.subscriberCount,
						postCount: maxPosts || 10,
						createdAt: new Date().toISOString()
					};

					this.plugin.settings.brunchSettings.subscribedBrunchAuthors.push(newSubscription);
					await this.plugin.saveSettings();
					new Notice(`Added @${username} (${profile.authorName}) to subscriptions`, 3000);
				}
			}

			if (lastCreatedFile && !importCancelled) {
				await this.openFile(lastCreatedFile);
			}
		} catch {
			cancelNotice.hide();
			new Notice("Brunch import failed. Check console for details.");
		}
	}

	async importBrunchKeyword(keyword: string, maxPosts?: number) {
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
			const limitText = maxPosts ? ` (max ${maxPosts})` : '';
			new Notice(`🏷️ Fetching posts from keyword "${keyword}"${limitText}...`);

			const fetcher = new BrunchKeywordFetcher(keyword);

			// First fetch article list to show progress
			const articles = await fetcher.fetchArticleList(maxPosts);

			if (articles.length === 0) {
				cancelNotice.hide();
				new Notice("No posts found in this keyword");
				return;
			}

			new Notice(`Found ${articles.length} posts. Fetching content...`);

			let successCount = 0;
			let errorCount = 0;
			let lastCreatedFile: TFile | null = null;
			const totalPosts = articles.length;

			// Fetch and save posts one by one
			for (let i = 0; i < articles.length; i++) {
				if (importCancelled) break;

				const article = articles[i];
				const progress = `(${i + 1}/${totalPosts})`;

				try {
					new Notice(`Fetching ${progress}: ${article.title || `@${article.userId}/${article.articleNo}`}`, 3000);

					const postFetcher = new BrunchFetcher(article.userId);
					const post = await postFetcher.fetchSinglePost(article.articleNo);

					const createdFile = await this.plugin.createBrunchMarkdownFile(post);

					if (createdFile) {
						lastCreatedFile = createdFile;
					}
					successCount++;
				} catch (error) {
					console.error(`Failed to import @${article.userId}/${article.articleNo}:`, error);
					errorCount++;
				}

				// Rate limiting
				if (i < articles.length - 1) {
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
			}

			cancelNotice.hide();

			let summary = importCancelled ?
				`Import cancelled: ${successCount} successful` :
				`Import complete: ${successCount} successful`;

			if (errorCount > 0) summary += `, ${errorCount} errors`;

			const processed = successCount + errorCount;
			summary += ` (${processed}/${totalPosts})`;

			if (!importCancelled && errorCount === 0) summary += ' ✅';
			else if (errorCount > 0) summary += ' ⚠️';

			new Notice(summary, 8000);

			if (lastCreatedFile && !importCancelled) {
				await this.openFile(lastCreatedFile);
			}
		} catch (error) {
			cancelNotice.hide();
			new Notice(`Brunch keyword import failed: ${error.message}`);
		}
	}

	async importBrunchBook(bookId: string, maxPosts?: number) {
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
			const limitText = maxPosts ? ` (max ${maxPosts})` : '';
			new Notice(`📖 Fetching posts from brunchbook "${bookId}"${limitText}...`);

			const fetcher = new BrunchBookFetcher(bookId);

			// First fetch article list to show progress
			const articles = await fetcher.fetchArticleList(maxPosts);

			if (articles.length === 0) {
				cancelNotice.hide();
				new Notice("No posts found in this brunchbook");
				return;
			}

			const bookTitle = await fetcher.getBookTitle();
			new Notice(`Found ${articles.length} posts in "${bookTitle}". Fetching content...`);

			let successCount = 0;
			let errorCount = 0;
			let lastCreatedFile: TFile | null = null;
			const totalPosts = articles.length;

			// Fetch and save posts one by one
			for (let i = 0; i < articles.length; i++) {
				if (importCancelled) break;

				const article = articles[i];
				const progress = `(${i + 1}/${totalPosts})`;

				try {
					new Notice(`Fetching ${progress}: @${article.profileId}/${article.articleNo}`, 3000);

					const postFetcher = new BrunchFetcher(article.profileId);
					const post = await postFetcher.fetchSinglePost(article.articleNo);

					// Add book info to series if not already set
					if (!post.series) {
						post.series = {
							title: bookTitle,
							url: `https://brunch.co.kr/brunchbook/${bookId}`,
						};
					}

					const createdFile = await this.plugin.createBrunchMarkdownFile(post);

					if (createdFile) {
						lastCreatedFile = createdFile;
					}
					successCount++;
				} catch (error) {
					console.error(`Failed to import @${article.profileId}/${article.articleNo}:`, error);
					errorCount++;
				}

				// Rate limiting
				if (i < articles.length - 1) {
					await new Promise(resolve => setTimeout(resolve, 1000));
				}
			}

			cancelNotice.hide();

			let summary = importCancelled ?
				`Import cancelled: ${successCount} successful` :
				`Import complete: ${successCount} successful`;

			if (errorCount > 0) summary += `, ${errorCount} errors`;

			const processed = successCount + errorCount;
			summary += ` (${processed}/${totalPosts})`;

			if (!importCancelled && errorCount === 0) summary += ' ✅';
			else if (errorCount > 0) summary += ' ⚠️';

			new Notice(summary, 8000);

			if (lastCreatedFile && !importCancelled) {
				await this.openFile(lastCreatedFile);
			}
		} catch (error) {
			cancelNotice.hide();
			new Notice(`Brunch book import failed: ${error.message}`);
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
