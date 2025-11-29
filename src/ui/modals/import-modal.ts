import { App, Modal, Notice } from 'obsidian';
import { NaverBlogFetcher } from '../../../naver-blog-fetcher';
import { UI_DEFAULTS, NOTICE_TIMEOUTS } from '../../constants';
import { isNaverBlogUrl, parseNaverBlogUrl } from '../../utils/url-utils';
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

		contentEl.createEl('h2', { text: this.plugin.i18n.t('modals.import_blog_url.title') });

		const inputContainer = contentEl.createDiv({ cls: 'naver-blog-input-container' });

		const input = inputContainer.createEl('input', {
			type: 'text',
			placeholder: 'Blog ID or Post URL',
			cls: 'naver-blog-input'
		});

		const exampleDiv = inputContainer.createDiv({ cls: 'naver-blog-example' });
		exampleDiv.createEl('br');
		exampleDiv.appendText('• Blog ID: yonofbooks');
		exampleDiv.createEl('br');
		exampleDiv.appendText('• Post URL: https://blog.naver.com/blogid/123456789');
		exampleDiv.createEl('br');
		exampleDiv.appendText('• Mobile: https://m.blog.naver.com/PostView.naver?blogId=xxx&logNo=xxx');

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
				}
			} catch {
				// Clipboard access denied - silently ignore
			}
		}, UI_DEFAULTS.modalTimeout);
	}

	async handleImport(inputValue: string) {
		if (!inputValue) {
			new Notice('Please enter a blog ID or post URL');
			return;
		}

		this.close();

		// Check if it's a post URL or just a blog ID
		if (isNaverBlogUrl(inputValue)) {
			// Single post import
			const parsed = parseNaverBlogUrl(inputValue);
			if (parsed) {
				await this.importSinglePost(parsed.blogId, parsed.logNo);
			} else {
				new Notice('Invalid Naver blog URL format');
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
