import { App, PluginSettingTab, Setting, Notice, normalizePath } from 'obsidian';

import { 
	DEFAULT_BLOG_POST_COUNT, 
	MAX_POST_IMPORT_LIMIT, 
	MAX_SUBSCRIPTION_POST_COUNT,
	PLACEHOLDERS 
} from '../constants';
import { AIProviderUtils } from '../utils/ai-provider-utils';
import type NaverBlogPlugin from '../../main';

export class NaverBlogSettingTab extends PluginSettingTab {
	plugin: NaverBlogPlugin;

	constructor(app: App, plugin: NaverBlogPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// AI configuration section
		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.ai_configuration'))
			.setHeading();

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.ai_provider'))
			.setDesc(this.plugin.i18n.t('settings.ai_provider_desc'))
			.addDropdown(dropdown => dropdown
				.addOption('openai', this.plugin.i18n.t('providers.openai'))
				.addOption('anthropic', this.plugin.i18n.t('providers.anthropic'))
				.addOption('google', this.plugin.i18n.t('providers.google'))
				.addOption('ollama', this.plugin.i18n.t('providers.ollama'))
				.setValue(this.plugin.settings.aiProvider)
				.onChange(async (value: 'openai' | 'anthropic' | 'google' | 'ollama') => {
					this.plugin.settings.aiProvider = value;
					// Auto-select default model for the new provider
					this.plugin.settings.aiModel = AIProviderUtils.getDefaultModelForProvider(value);
					await this.plugin.saveSettings();
					
					// Refresh models for the new provider
					if (value !== 'ollama') {
						void this.plugin.refreshModels(value).catch(() => {
							// Silently ignore model refresh errors
						});
					}
					
					this.display(); // Refresh settings to show appropriate API key field and model
				}));

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.ai_model'))
			.setDesc(this.plugin.i18n.t('settings.ai_model_desc'))
			.addDropdown(dropdown => {
				const availableModels = this.plugin.getAvailableModels();
				
				// Add available models to dropdown
				availableModels.forEach((model: string) => {
					dropdown.addOption(model, model);
				});
				
				// Set current value or default
				const currentModel = this.plugin.settings.aiModel || this.plugin.aiService.getModelName();
				dropdown.setValue(currentModel);
				
				dropdown.onChange(async (value) => {
					this.plugin.settings.aiModel = value;
					await this.plugin.saveSettings();
				});
			});


		// Show appropriate API key field based on provider
		switch (this.plugin.settings.aiProvider) {
			case 'openai': {
				new Setting(containerEl)
					.setName(this.plugin.i18n.t('settings.openai_api_key'))
					.setDesc(this.plugin.i18n.t('settings.openai_api_key_desc'))
					.addText(text => text
						.setPlaceholder('sk-...')
						.setValue(this.plugin.settings.openaiApiKey)
						.onChange(async (value) => {
							this.plugin.settings.openaiApiKey = value;
							await this.plugin.saveSettings();
						}));
				break;
			}

			case 'anthropic': {
				new Setting(containerEl)
					.setName(this.plugin.i18n.t('settings.anthropic_api_key'))
					.setDesc(this.plugin.i18n.t('settings.anthropic_api_key_desc'))
					.addText(text => text
						.setPlaceholder('sk-ant-...')
						.setValue(this.plugin.settings.anthropicApiKey)
						.onChange(async (value) => {
							this.plugin.settings.anthropicApiKey = value;
							await this.plugin.saveSettings();
						}));
				break;
			}

			case 'google': {
				new Setting(containerEl)
					.setName(this.plugin.i18n.t('settings.google_api_key'))
					.setDesc(this.plugin.i18n.t('settings.google_api_key_desc'))
					.addText(text => text
						.setPlaceholder('AIza...')
						.setValue(this.plugin.settings.googleApiKey)
						.onChange(async (value) => {
							this.plugin.settings.googleApiKey = value;
							await this.plugin.saveSettings();
						}));
				break;
			}

			case 'ollama': {
				new Setting(containerEl)
					.setName(this.plugin.i18n.t('settings.ollama_endpoint'))
					.setDesc(this.plugin.i18n.t('settings.ollama_endpoint_desc'))
					.addText(text => text
						.setPlaceholder('http://localhost:11434')
						.setValue(this.plugin.settings.ollamaEndpoint)
						.onChange(async (value) => {
							this.plugin.settings.ollamaEndpoint = value;
							await this.plugin.saveSettings();
						}));
				break;
			}
		}

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.default_folder'))
			.setDesc(this.plugin.i18n.t('settings.default_folder_desc'))
			.addText(text => {
				const input = text
					.setPlaceholder(PLACEHOLDERS.folder.default)
					.setValue(this.plugin.settings.defaultFolder)
					.onChange(async (value) => {
						this.plugin.settings.defaultFolder = value ? normalizePath(value) : '';
						await this.plugin.saveSettings();
					});
				
				// Add folder dropdown functionality
				this.setupFolderDropdown(input.inputEl, (folder) => {
					const normalizedFolder = normalizePath(folder);
					this.plugin.settings.defaultFolder = normalizedFolder;
					void this.plugin.saveSettings();
					input.setValue(normalizedFolder);
				}, () => {
					this.plugin.settings.defaultFolder = '';
					void this.plugin.saveSettings();
					input.setValue('');
				});
				
				return input;
			});

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.enable_ai_tags'))
			.setDesc(this.plugin.i18n.t('settings.enable_ai_tags_desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAiTags)
				.onChange(async (value) => {
					this.plugin.settings.enableAiTags = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.enable_ai_excerpt'))
			.setDesc(this.plugin.i18n.t('settings.enable_ai_excerpt_desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAiExcerpt)
				.onChange(async (value) => {
					this.plugin.settings.enableAiExcerpt = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.enable_duplicate_check'))
			.setDesc(this.plugin.i18n.t('settings.enable_duplicate_check_desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDuplicateCheck)
				.onChange(async (value) => {
					this.plugin.settings.enableDuplicateCheck = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.enable_image_download'))
			.setDesc(this.plugin.i18n.t('settings.enable_image_download_desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableImageDownload)
				.onChange(async (value) => {
					this.plugin.settings.enableImageDownload = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide image folder setting
				}));

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.post_import_limit'))
			.setDesc(this.plugin.i18n.t('settings.post_import_limit_desc'))
			.addText(text => text
				.setPlaceholder(PLACEHOLDERS.postLimit)
				.setValue(this.plugin.settings.postImportLimit.toString())
				.onChange(async (value) => {
					let numValue = parseInt(value) || 0;
					// Validate input
					if (numValue < 0) {
						numValue = 0;
						text.setValue('0');
					} else if (numValue > MAX_POST_IMPORT_LIMIT) {
						numValue = MAX_POST_IMPORT_LIMIT;
						text.setValue(MAX_POST_IMPORT_LIMIT.toString());
						new Notice(this.plugin.i18n.t('notices.post_limit_exceeded'));
					}
					this.plugin.settings.postImportLimit = numValue;
					await this.plugin.saveSettings();
				}));

		if (this.plugin.settings.enableImageDownload) {
			new Setting(containerEl)
				.setName(this.plugin.i18n.t('settings.image_folder'))
				.setDesc(this.plugin.i18n.t('settings.image_folder_desc'))
				.addText(text => {
					const input = text
						.setPlaceholder(PLACEHOLDERS.folder.image)
						.setValue(this.plugin.settings.imageFolder)
						.onChange(async (value) => {
							this.plugin.settings.imageFolder = value ? normalizePath(value) : '';
							await this.plugin.saveSettings();
						});
					
					// Add folder dropdown functionality
					this.setupFolderDropdown(input.inputEl, (folder) => {
						const normalizedFolder = normalizePath(folder);
						this.plugin.settings.imageFolder = normalizedFolder;
						void this.plugin.saveSettings();
						input.setValue(normalizedFolder);
					}, () => {
						this.plugin.settings.imageFolder = '';
						void this.plugin.saveSettings();
						input.setValue('');
					});
					
					return input;
				});
		}


		// Subscribed blogs section
		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.subscribed_blogs'))
			.setHeading();
		
		const subscriptionDiv = containerEl.createDiv();
		this.displaySubscriptions(subscriptionDiv);

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.add_blog_id'))
			.setDesc(this.plugin.i18n.t('settings.add_blog_id_desc'))
			.addText(text => {
				text.setPlaceholder(PLACEHOLDERS.blogId);
				return text;
			})
			.addButton(button => button
				.setButtonText(this.plugin.i18n.t('settings.add_button'))
				.onClick(async () => {
					const input = button.buttonEl.previousElementSibling as HTMLInputElement;
					const blogId = input.value.trim();
					if (blogId && !this.plugin.settings.subscribedBlogs.includes(blogId)) {
						this.plugin.settings.subscribedBlogs.push(blogId);
						
						// Initialize blog subscription with default count
						this.plugin.settings.blogSubscriptions.push({
							blogId: blogId,
							postCount: DEFAULT_BLOG_POST_COUNT
						});
						
						await this.plugin.saveSettings();
						input.value = '';
						this.displaySubscriptions(subscriptionDiv);
					}
				}));

		// Naver Cafe settings section
		new Setting(containerEl)
			.setName('Naver Cafe settings')
			.setHeading();

		// Cookie description
		const cookieDesc = document.createDocumentFragment();
		cookieDesc.appendText('For private/member-only cafes. ');
		cookieDesc.createEl('br');
		cookieDesc.appendText('Get from Chrome: F12 → Application → Cookies → naver.com');

		new Setting(containerEl)
			.setName('Cookie authentication')
			.setDesc(cookieDesc);

		// NID_AUT input
		new Setting(containerEl)
			.setName('NID_AUT')
			.setDesc('Copy the NID_AUT cookie value')
			.addText(text => text
				.setPlaceholder('Paste NID_AUT value here')
				.setValue(this.plugin.settings.cafeSettings?.nidAut || '')
				.onChange(async (value) => {
					this.ensureCafeSettings();
					// Clean the value - remove "NID_AUT=" prefix if user pasted it
					const cleanValue = value.replace(/^NID_AUT\s*=\s*/i, '').trim();
					this.plugin.settings.cafeSettings!.nidAut = cleanValue;
					this.updateCookieString();
					await this.plugin.saveSettings();
				}));

		// NID_SES input
		new Setting(containerEl)
			.setName('NID_SES')
			.setDesc('Copy the NID_SES cookie value')
			.addText(text => text
				.setPlaceholder('Paste NID_SES value here')
				.setValue(this.plugin.settings.cafeSettings?.nidSes || '')
				.onChange(async (value) => {
					this.ensureCafeSettings();
					// Clean the value - remove "NID_SES=" prefix if user pasted it
					const cleanValue = value.replace(/^NID_SES\s*=\s*/i, '').trim();
					this.plugin.settings.cafeSettings!.nidSes = cleanValue;
					this.updateCookieString();
					await this.plugin.saveSettings();
				}));
	}

	displaySubscriptions(containerEl: HTMLElement) {
		containerEl.empty();
		
		if (this.plugin.settings.subscribedBlogs.length === 0) {
			containerEl.createEl('p', { text: this.plugin.i18n.t('settings.no_subscribed_blogs') });
			return;
		}

		this.plugin.settings.subscribedBlogs.forEach((blogId: string, index: number) => {
			const blogDiv = containerEl.createDiv({ cls: 'naver-blog-item' });
			
			// Blog ID
			blogDiv.createEl('span', { text: blogId });
			
			// Post count setting
			const countDiv = blogDiv.createDiv({ cls: 'naver-blog-count-container' });
			
			countDiv.createEl('span', {
				text: this.plugin.i18n.t('settings.posts_label') + ':',
				cls: 'naver-blog-count-label'
			});
			
			const blogSubscription = this.plugin.settings.blogSubscriptions.find(sub => sub.blogId === blogId);
			const currentCount = blogSubscription?.postCount || DEFAULT_BLOG_POST_COUNT;
			
			const countInput = countDiv.createEl('input', {
				type: 'number',
				value: currentCount.toString(),
				cls: 'naver-blog-count-input'
			});
			countInput.min = '1';
			countInput.max = MAX_SUBSCRIPTION_POST_COUNT.toString();
			
			countInput.onchange = async () => {
				const newCount = parseInt(countInput.value) || DEFAULT_BLOG_POST_COUNT;
				
				// Update or create blog subscription
				const existingIndex = this.plugin.settings.blogSubscriptions.findIndex(sub => sub.blogId === blogId);
				if (existingIndex >= 0) {
					this.plugin.settings.blogSubscriptions[existingIndex].postCount = newCount;
				} else {
					this.plugin.settings.blogSubscriptions.push({
						blogId: blogId,
						postCount: newCount
					});
				}
				
				await this.plugin.saveSettings();
			};
			
			// Sync button
			const syncButton = blogDiv.createEl('button', { 
				text: this.plugin.i18n.t('settings.sync_button'),
				cls: 'naver-blog-sync-button'
			});
			syncButton.onclick = async () => {
				try {
					new Notice(`Syncing ${blogId}...`);
					const posts = await this.plugin.fetchNaverBlogPosts(blogId, currentCount);
					
					let successCount = 0;
					for (const post of posts) {
						try {
							await this.plugin.createMarkdownFile(post);
							successCount++;
						} catch {
									// Skip failed post
							}
					}
					
					new Notice(`Synced ${successCount} posts from ${blogId}`);
				} catch (error) {
					new Notice(`Failed to sync ${blogId}: ${error.message}`);
				}
			};
			
			// Remove button
			const removeButton = blogDiv.createEl('button', { 
				text: this.plugin.i18n.t('settings.remove_button'),
				cls: 'naver-blog-remove-button'
			});
			removeButton.onclick = async () => {
				// Remove from subscribed blogs
				this.plugin.settings.subscribedBlogs.splice(index, 1);
				
				// Remove from blog subscriptions
				const subIndex = this.plugin.settings.blogSubscriptions.findIndex(sub => sub.blogId === blogId);
				if (subIndex >= 0) {
					this.plugin.settings.blogSubscriptions.splice(subIndex, 1);
				}
				
				await this.plugin.saveSettings();
				this.displaySubscriptions(containerEl);
			};
		});
	}

	/**
	 * Ensure cafeSettings object exists
	 */
	private ensureCafeSettings(): void {
		if (!this.plugin.settings.cafeSettings) {
			this.plugin.settings.cafeSettings = {
				naverCookie: '',
				nidAut: '',
				nidSes: '',
				cafeImportFolder: 'Naver Cafe Posts',
				includeComments: false,
				downloadCafeImages: true,
				excludeNotice: true,
				excludeRecommended: false,
				minContentLength: 0,
				subscribedCafes: [],
				enableCafeDuplicateCheck: true
			};
		}
	}

	/**
	 * Build cookie string from NID_AUT and NID_SES values
	 */
	private updateCookieString(): void {
		const settings = this.plugin.settings.cafeSettings;
		if (!settings) return;

		const parts: string[] = [];
		if (settings.nidAut) {
			parts.push(`NID_AUT=${settings.nidAut}`);
		}
		if (settings.nidSes) {
			parts.push(`NID_SES=${settings.nidSes}`);
		}
		settings.naverCookie = parts.join('; ');
	}

	getAllFolders(): string[] {
		// Use Obsidian's getAllFolders() API
		const allFolders = this.app.vault.getAllFolders();
		const folderPaths = allFolders.map(folder => folder.path);
		
		// Add root folder as empty string
		folderPaths.unshift('');
		
		return folderPaths.sort();
	}

	setupFolderDropdown(inputEl: HTMLInputElement, onSelect: (folder: string) => void, onClear?: () => void) {
		let dropdownEl: HTMLElement | null = null;
		let isDropdownVisible = false;
		let searchIcon: HTMLElement | null = null;
		let clearButton: HTMLElement | null = null;

		// Create wrapper container for input with icons
		const wrapper = document.createElement('div');
		wrapper.className = 'naver-blog-search-wrapper';

		// Insert wrapper before input and move input into it
		inputEl.parentNode?.insertBefore(wrapper, inputEl);
		wrapper.appendChild(inputEl);

		// Create search icon
		searchIcon = document.createElement('div');
		searchIcon.textContent = '🔍';
		searchIcon.className = 'naver-blog-search-icon';
		wrapper.appendChild(searchIcon);

		// Add padding to input for search icon
		inputEl.className = 'naver-blog-search-input';

		// Create clear button (initially hidden)
		const updateClearButton = () => {
			if (clearButton) {
				clearButton.remove();
				clearButton = null;
			}

			if (inputEl.value.trim() && onClear) {
				clearButton = document.createElement('div');
				clearButton.textContent = '×';
				clearButton.className = 'naver-blog-search-clear';

				clearButton.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					if (onClear) {
						onClear();
					}
					updateClearButton();
				});

				wrapper.appendChild(clearButton);
			}
		};

		// Initial clear button update
		updateClearButton();

		const showDropdown = (filter: string = '') => {
			this.hideDropdown();
			
			const folders = this.getAllFolders();
			const filteredFolders = folders.filter(folder => 
				folder.toLowerCase().includes(filter.toLowerCase())
			);

			if (filteredFolders.length === 0) return;

			dropdownEl = document.createElement('div');
			dropdownEl.className = 'naver-blog-dropdown';
			dropdownEl.style.width = `${inputEl.offsetWidth}px`;

			filteredFolders.forEach((folder, index) => {
				const itemEl = document.createElement('div');
				itemEl.className = 'naver-blog-dropdown-item';
				itemEl.textContent = folder || '(Root)';

				itemEl.addEventListener('click', () => {
					onSelect(folder);
					this.hideDropdown();
					updateClearButton();
				});

				dropdownEl.appendChild(itemEl);
			});

			// Position the dropdown relative to the wrapper
			wrapper.appendChild(dropdownEl);
			isDropdownVisible = true;
		};

		const hideDropdown = () => {
			if (dropdownEl && dropdownEl.parentNode) {
				dropdownEl.parentNode.removeChild(dropdownEl);
				dropdownEl = null;
				isDropdownVisible = false;
			}
		};

		this.hideDropdown = hideDropdown;

		// Show dropdown on focus/click
		inputEl.addEventListener('focus', () => {
			showDropdown(inputEl.value);
		});

		inputEl.addEventListener('click', () => {
			if (!isDropdownVisible) {
				showDropdown(inputEl.value);
			}
		});

		// Filter dropdown on input and update clear button
		inputEl.addEventListener('input', () => {
			if (isDropdownVisible) {
				showDropdown(inputEl.value);
			}
			updateClearButton();
		});

		// Hide dropdown on blur (with delay to allow clicks)
		inputEl.addEventListener('blur', () => {
			setTimeout(() => {
				hideDropdown();
			}, 150);
		});

		// Hide dropdown on escape key
		inputEl.addEventListener('keydown', (e) => {
			if (e.key === 'Escape') {
				hideDropdown();
			}
		});
	}

	createImportSummary(successCount: number, errorLogCount: number, errorCount: number, totalPosts: number): string {
		let summary = `Import complete: ${successCount} successful`;
		
		if (errorLogCount > 0) {
			summary += `, ${errorLogCount} error logs created`;
		}
		
		if (errorCount > 0) {
			summary += `, ${errorCount} file creation errors`;
		}
		
		summary += ` (${totalPosts} total)`;
		
		if (errorLogCount > 0 || errorCount > 0) {
			summary += ` ⚠️`;
		} else {
			summary += ` ✅`;
		}
		
		return summary;
	}

	hideDropdown() {
		// This will be overridden in setupFolderDropdown
	}
}