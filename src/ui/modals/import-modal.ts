import { App, Modal, Notice } from 'obsidian';
import { NaverBlogFetcher } from '../../../naver-blog-fetcher';
import { UI_DEFAULTS, NOTICE_TIMEOUTS } from '../../constants';
import { isNaverBlogUrl, parseNaverBlogUrl, extractBlogIdFromUrl } from '../../utils/url-utils';
import type NaverBlogPlugin from '../../../main';

export class NaverBlogImportModal extends Modal {
	plugin: NaverBlogPlugin;

	constructor(app: App, plugin: NaverBlogPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Import from Naver Blog' });

		const inputContainer = contentEl.createDiv({ cls: 'naver-blog-input-container' });

		const input = inputContainer.createEl('input', {
			type: 'text',
			placeholder: 'Blog ID or URL (e.g., yonofbooks or blog.naver.com/...)',
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
						 detection.type === 'bulk' ? '📚' : '⚠️';
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
				if (clipboardText && isNaverBlogUrl(clipboardText)) {
					input.value = clipboardText.trim();
					input.select();
					updateDetection();
				}
			} catch {
				// Clipboard access denied - silently ignore
			}
		}, UI_DEFAULTS.modalTimeout);
	}

	detectInputType(value: string): { type: 'single' | 'bulk' | 'invalid'; message: string } {
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
			new Notice('Please enter a blog ID or post URL');
			return;
		}

		this.close();

		// Check if it's a post URL or just a blog ID
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

	async importSinglePost(blogId: string, logNo: string) {
		try {
			new Notice(`Importing post from ${blogId}...`, NOTICE_TIMEOUTS.short);

			const fetcher = new NaverBlogFetcher(blogId);
			const post = await fetcher.fetchSinglePost(logNo);

			if (!post) {
				new Notice('Failed to fetch post', NOTICE_TIMEOUTS.medium);
				return;
			}

			await this.plugin.createMarkdownFile({
				...post,
				tags: post.originalTags.length > 0 ? post.originalTags : [],
				excerpt: post.content.substring(0, 150) + '...'
			});

			new Notice(`✅ Imported: "${post.title}"`, NOTICE_TIMEOUTS.medium);
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
			const totalPosts = posts.length;

			for (let i = 0; i < posts.length; i++) {
				if (importCancelled) break;

				const post = posts[i];
				const progress = `(${i + 1}/${totalPosts})`;
				const isErrorPost = post.title.startsWith('[오류]');

				try {
					new Notice(`Creating file ${progress}: ${post.title}`, 3000);
					await this.plugin.createMarkdownFile(post);

					if (isErrorPost) {
						errorLogCount++;
					} else {
						successCount++;
					}
				} catch {
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
		} catch {
			cancelNotice.hide();
			new Notice("Import failed. Check console for details.");
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
