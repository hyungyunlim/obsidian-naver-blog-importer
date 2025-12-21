import { App, Modal, Setting, Notice } from 'obsidian';
import { DEFAULT_BLOG_POST_COUNT, UI_DEFAULTS } from '../../constants';
import type NaverBlogPlugin from '../../../main';

export class NaverBlogSubscribeModal extends Modal {
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
					.onChange((value) => {
						this.blogId = value;
					});
				
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						void this.handleSubscribe();
					}
				});
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText(this.plugin.i18n.t('modals.subscribe_blog.subscribe_button'))
				.setCta()
				.onClick(() => {
					void this.handleSubscribe();
				}));

		setTimeout(() => {
			if (inputElement) {
				inputElement.focus();
			}
		}, UI_DEFAULTS.modalTimeout);
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

		// Initialize blog subscription with metadata
		this.plugin.settings.blogSubscriptions.push({
			id: `naver-${this.blogId}-${Date.now()}`,
			blogId: this.blogId,
			postCount: DEFAULT_BLOG_POST_COUNT,
			createdAt: new Date().toISOString()
		});
		
		await this.plugin.saveSettings();
		
		new Notice(`Subscribed to ${this.blogId}`);
		this.close();
		
		// Immediately sync the new subscription
		void this.plugin.blogService.syncSubscribedBlogs();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}