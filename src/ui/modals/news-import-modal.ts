import { App, Modal, Notice, TFile } from 'obsidian';
import { NaverNewsFetcher } from '../../fetchers/naver-news-fetcher';
import { ImageService } from '../../services/image-service';
import { UI_DEFAULTS, NOTICE_TIMEOUTS } from '../../constants';
import type NaverBlogPlugin from '../../../main';

export class NaverNewsImportModal extends Modal {
	plugin: NaverBlogPlugin;

	constructor(app: App, plugin: NaverBlogPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: this.plugin.i18n.t('modals.news_import.title') });

		const inputContainer = contentEl.createDiv({ cls: 'naver-blog-input-container' });

		const input = inputContainer.createEl('input', {
			type: 'text',
			placeholder: this.plugin.i18n.t('modals.news_import.placeholder'),
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

			const isValid = this.isNaverNewsUrl(value);
			detectionDiv.empty();

			if (isValid) {
				const parsed = this.parseNewsUrl(value);
				if (parsed) {
					detectionDiv.setText(`📰 ${this.plugin.i18n.t('modals.news_import.detected')} (oid: ${parsed.oid}, aid: ${parsed.aid})`);
					detectionDiv.style.color = 'var(--text-muted)';
				}
			} else {
				detectionDiv.setText(`⚠️ ${this.plugin.i18n.t('modals.news_import.invalid_url')}`);
				detectionDiv.style.color = 'var(--text-error)';
			}
		};

		input.addEventListener('input', updateDetection);

		const buttonContainer = contentEl.createDiv({ cls: 'naver-blog-button-container' });

		const cancelButton = buttonContainer.createEl('button', {
			text: this.plugin.i18n.t('modals.import_single_post.cancel_button')
		});
		cancelButton.addEventListener('click', () => this.close());

		const importButton = buttonContainer.createEl('button', {
			text: this.plugin.i18n.t('modals.news_import.import_button'),
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
				if (clipboardText && this.isNaverNewsUrl(clipboardText)) {
					input.value = clipboardText.trim();
					input.select();
					updateDetection();
				}
			} catch {
				// Clipboard access denied - silently ignore
			}
		}, UI_DEFAULTS.modalTimeout);
	}

	isNaverNewsUrl(value: string): boolean {
		return value.includes('n.news.naver.com') ||
			   value.includes('news.naver.com') ||
			   value.includes('m.news.naver.com');
	}

	parseNewsUrl(url: string): { oid: string; aid: string } | null {
		// Short URL: https://n.news.naver.com/article/{oid}/{aid}
		let match = url.match(/n\.news\.naver\.com\/article\/(\d+)\/(\d+)/);
		if (match) {
			return { oid: match[1], aid: match[2] };
		}

		// Mobile URL: https://m.news.naver.com/article/{oid}/{aid}
		match = url.match(/m\.news\.naver\.com\/article\/(\d+)\/(\d+)/);
		if (match) {
			return { oid: match[1], aid: match[2] };
		}

		// Long URL with query params
		match = url.match(/[?&]oid=(\d+).*[?&]aid=(\d+)|[?&]aid=(\d+).*[?&]oid=(\d+)/);
		if (match) {
			const oid = match[1] || match[4];
			const aid = match[2] || match[3];
			if (oid && aid) {
				return { oid, aid };
			}
		}

		return null;
	}

	async handleImport(inputValue: string) {
		if (!inputValue) {
			new Notice(this.plugin.i18n.t('modals.news_import.enter_url'));
			return;
		}

		if (!this.isNaverNewsUrl(inputValue)) {
			new Notice(this.plugin.i18n.t('modals.news_import.invalid_url'));
			return;
		}

		this.close();

		try {
			new Notice(this.plugin.i18n.t('modals.news_import.importing'), NOTICE_TIMEOUTS.short);

			const fetcher = new NaverNewsFetcher(this.app, this.plugin.settings.newsSettings);
			const article = await fetcher.fetchArticle(inputValue);

			if (!article) {
				new Notice(this.plugin.i18n.t('modals.news_import.fetch_failed'), NOTICE_TIMEOUTS.medium);
				return;
			}

			// Save article
			let filePath = await fetcher.saveArticle(article);

			// Download images if enabled
			if (this.plugin.settings.newsSettings.downloadNewsImages && article.images.length > 0) {
				try {
					const file = this.app.vault.getAbstractFileByPath(filePath);
					if (file instanceof TFile) {
						let content = await this.app.vault.read(file);

						// Use ImageService to download images
						const imageService = new ImageService(this.app, this.plugin.settings);

						// Calculate image folder path
						const imageFolder = `${this.plugin.settings.newsSettings.newsImageFolder}/news_${article.pressId}_${article.articleId}`;

						// Download and process images
						content = await imageService.downloadAndProcessImages(
							content,
							`news_${article.pressId}_${article.articleId}`,
							imageFolder,
							filePath.split('/').slice(0, -1).join('/')
						);

						await this.app.vault.modify(file, content);
					}
				} catch (error) {
					new Notice(`${this.plugin.i18n.t('modals.news_import.image_download_partial')}: ${error.message}`, NOTICE_TIMEOUTS.medium);
				}
			}

			new Notice(`✅ ${this.plugin.i18n.t('modals.news_import.success')}: "${article.title}"`, NOTICE_TIMEOUTS.medium);

			// Open the created file
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				await this.openFile(file);
			}
		} catch (error) {
			new Notice(`❌ ${this.plugin.i18n.t('modals.news_import.fetch_failed')}: ${error.message}`, NOTICE_TIMEOUTS.medium);
		}
	}

	async openFile(file: TFile) {
		const leaf = this.plugin.app.workspace.getLeaf(false);
		await leaf.openFile(file, { active: true });
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
