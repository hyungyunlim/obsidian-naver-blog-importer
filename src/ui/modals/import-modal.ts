import { App, Modal, Setting, Notice } from 'obsidian';
import { UI_DEFAULTS, NOTICE_TIMEOUTS } from '../../constants';
import type NaverBlogPlugin from '../../../main';

export class NaverBlogImportModal extends Modal {
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
		}, UI_DEFAULTS.modalTimeout);
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
		const messageEl = (cancelNotice as any).messageEl;
		if (messageEl) {
			messageEl.addEventListener('click', () => {
				importCancelled = true;
				cancelNotice.hide();
				new Notice("Import cancelled by user", NOTICE_TIMEOUTS.medium);
			});
		}

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
					} else {
						successCount++;
					}
				} catch (error) {
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
			new Notice("Import failed. Please check the console for details.");
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}