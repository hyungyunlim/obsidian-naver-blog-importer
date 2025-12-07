import { App, Modal, Notice, TFile } from 'obsidian';
import { NaverCafeFetcher } from '../../fetchers/naver-cafe-fetcher';
import { UI_DEFAULTS, NOTICE_TIMEOUTS, parseCafeUrl } from '../../constants';
import type NaverBlogPlugin from '../../../main';
import type { ProcessedCafePost } from '../../types';

export class NaverCafeImportModal extends Modal {
	plugin: NaverBlogPlugin;

	constructor(app: App, plugin: NaverBlogPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Import from Naver Cafe' });

		const inputContainer = contentEl.createDiv({ cls: 'naver-blog-input-container' });

		const input = inputContainer.createEl('input', {
			type: 'text',
			placeholder: 'Cafe article URL (e.g., cafe.naver.com/mycafe/12345)',
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
						 detection.type === 'invalid' ? '⚠️' : '📚';
			detectionDiv.setText(`${icon} ${detection.message}`);
			detectionDiv.style.color = detection.type === 'invalid' ?
				'var(--text-error)' : 'var(--text-muted)';
		};

		input.addEventListener('input', updateDetection);

		// Help text
		const helpDiv = inputContainer.createDiv({ cls: 'naver-cafe-help' });
		helpDiv.style.marginTop = '12px';
		helpDiv.style.fontSize = '11px';
		helpDiv.style.color = 'var(--text-faint)';
		helpDiv.innerHTML = `
			<strong>Supported formats:</strong><br>
			• https://cafe.naver.com/cafename/12345<br>
			• https://m.cafe.naver.com/cafename/12345<br>
			• cafe.naver.com/ArticleRead.nhn?clubid=123&articleid=456
		`;

		const buttonContainer = contentEl.createDiv({ cls: 'naver-blog-button-container' });

		const cancelButton = buttonContainer.createEl('button', {
			text: this.plugin.i18n.t('modals.import_single_post.cancel_button')
		});
		cancelButton.addEventListener('click', () => this.close());

		const importButton = buttonContainer.createEl('button', {
			text: 'Import',
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
				if (clipboardText && this.isNaverCafeUrl(clipboardText)) {
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

	detectInputType(value: string): { type: 'single' | 'invalid'; message: string } {
		if (!this.isNaverCafeUrl(value)) {
			return { type: 'invalid', message: 'Not a Naver Cafe URL' };
		}

		const parsed = parseCafeUrl(value);
		if (parsed && parsed.articleId) {
			const cafeIdentifier = parsed.cafeUrl || parsed.cafeId || 'unknown';
			return {
				type: 'single',
				message: `Article from "${cafeIdentifier}" (articleId: ${parsed.articleId})`
			};
		}

		return { type: 'invalid', message: 'Could not parse article ID from URL' };
	}

	async handleImport(inputValue: string) {
		if (!inputValue) {
			new Notice('Please enter a cafe article URL');
			return;
		}

		const parsed = parseCafeUrl(inputValue);
		if (!parsed || !parsed.articleId) {
			new Notice('Invalid Naver Cafe URL. Please check the format.');
			return;
		}

		this.close();

		const cafeIdentifier = parsed.cafeUrl || parsed.cafeId;
		if (!cafeIdentifier) {
			new Notice('Could not extract cafe identifier from URL');
			return;
		}

		await this.importSingleArticle(cafeIdentifier, parsed.articleId);
	}

	async importSingleArticle(cafeIdOrUrl: string, articleId: string) {
		try {
			new Notice(`Importing cafe article...`, NOTICE_TIMEOUTS.short);

			const cookie = this.plugin.settings.cafeSettings?.naverCookie || '';
			const fetcher = new NaverCafeFetcher(cafeIdOrUrl, cookie);
			const article = await fetcher.fetchSingleArticle(articleId);

			if (!article) {
				new Notice('Failed to fetch article', NOTICE_TIMEOUTS.medium);
				return;
			}

			// Convert to ProcessedCafePost
			const processedPost: ProcessedCafePost = {
				title: this.cleanTitle(article.title),
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
			};

			const createdFile = await this.plugin.createCafeMarkdownFile(processedPost);

			new Notice(`✅ Imported: "${processedPost.title}"`, NOTICE_TIMEOUTS.medium);

			// Open the created file
			if (createdFile) {
				await this.openFile(createdFile);
			}
		} catch (error) {
			new Notice(`❌ Import failed: ${error.message}`, NOTICE_TIMEOUTS.medium);
		}
	}

	cleanTitle(title: string): string {
		return title
			.replace(/^\[.*?\]\s*/, '')
			.replace(/\s*\[.*?\]$/, '')
			.trim();
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
