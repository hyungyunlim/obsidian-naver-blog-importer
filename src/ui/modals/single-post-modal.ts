import { App, Modal, Notice } from 'obsidian';
import { NaverBlogFetcher } from '../../../naver-blog-fetcher';
import { PLACEHOLDERS, UI_DEFAULTS, NOTICE_TIMEOUTS } from '../../constants';
import type NaverBlogPlugin from '../../../main';

export class NaverBlogSinglePostModal extends Modal {
	plugin: NaverBlogPlugin;

	constructor(app: App, plugin: NaverBlogPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: this.plugin.i18n.t('modals.import_single_post.title') });

		const inputContainer = contentEl.createDiv({ cls: 'naver-blog-input-container' });

		const inputLabel = inputContainer.createEl('label', {
			text: this.plugin.i18n.t('modals.import_single_post.log_no_label') + ':',
			cls: 'setting-item-name naver-blog-input-label'
		});

		const input = inputContainer.createEl('input', {
			type: 'text',
			placeholder: this.plugin.i18n.t('modals.import_single_post.log_no_placeholder'),
			cls: 'naver-blog-input'
		});

		const exampleDiv = inputContainer.createDiv({ cls: 'naver-blog-example' });
		
		const exampleTitle = exampleDiv.createEl('strong', { text: 'Examples:' });
		exampleDiv.createEl('br');
		exampleDiv.appendText('• Desktop URL: https://blog.naver.com/yonofbooks/220883239733');
		exampleDiv.createEl('br');
		exampleDiv.appendText('• Mobile URL: https://m.blog.naver.com/PostView.naver?blogId=xk2a1&logNo=223926972265');
		exampleDiv.createEl('br');
		exampleDiv.appendText('• LogNo only: 220883239733');

		const buttonContainer = contentEl.createDiv({ cls: 'naver-blog-button-container' });

		const cancelButton = buttonContainer.createEl('button', {
			text: this.plugin.i18n.t('modals.import_single_post.cancel_button')
		});
		cancelButton.addEventListener('click', () => this.close());

		const importButton = buttonContainer.createEl('button', {
			text: this.plugin.i18n.t('modals.import_single_post.import_button'),
			cls: 'mod-cta'
		});

		importButton.addEventListener('click', async () => {
			const inputValue = input.value.trim();
			if (!inputValue) {
				new Notice('Please enter a post URL or LogNo');
				return;
			}

			// Parse input to extract blogId and logNo
			let blogId = '';
			let logNo = '';

			if (inputValue.includes('blog.naver.com') || inputValue.includes('m.blog.naver.com')) {
				// Handle both desktop and mobile URLs
				let urlMatch;
				
				if (inputValue.includes('m.blog.naver.com')) {
					// Mobile URL format: https://m.blog.naver.com/PostView.naver?blogId=xk2a1&logNo=223926972265
					urlMatch = inputValue.match(/[?&]blogId=([^&]+).*[?&]logNo=(\d+)/);
				} else {
					// Desktop URL format: https://blog.naver.com/blogid/logno
					urlMatch = inputValue.match(/blog\.naver\.com\/([^\/]+)\/(\d+)/);
				}
				
				if (urlMatch) {
					blogId = urlMatch[1];
					logNo = urlMatch[2];
				} else {
					new Notice('Invalid Naver blog URL format');
					return;
				}
			} else if (/^\d{8,15}$/.test(inputValue)) {
				// LogNo only - need to ask for blog ID or use default
				blogId = 'yonofbooks'; // Default for testing, could be made configurable
				logNo = inputValue;
				new Notice(`Using default blog ID: ${blogId}`, 3000);
			} else {
				new Notice('Please enter a valid URL or LogNo (8-15 digits)');
				return;
			}

			// Start import process
			this.close();
			
			try {
				new Notice(`Importing post ${logNo} from ${blogId}...`, 3000);
				
				const fetcher = new NaverBlogFetcher(blogId);
				const post = await fetcher.fetchSinglePost(logNo);
				
				
				// Create the file
				await this.plugin.createMarkdownFile({
					...post,
					tags: ['imported'],
					excerpt: post.content.substring(0, 150) + '...'
				});
				
				new Notice(`✓ Successfully imported: "${post.title}"`, NOTICE_TIMEOUTS.medium);
			} catch (error) {
				new Notice(`✗ Failed to import post: ${error.message}`, NOTICE_TIMEOUTS.medium);
			}
		});

		// Enter key to import
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				importButton.click();
			}
		});

		// Focus the input
		setTimeout(() => input.focus(), UI_DEFAULTS.modalTimeout);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}