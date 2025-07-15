import { App, PluginSettingTab, Setting, Notice, TFolder } from 'obsidian';
import { FolderSuggestModal } from './modals/folder-suggest-modal';
import { 
	DEFAULT_BLOG_POST_COUNT, 
	MAX_POST_IMPORT_LIMIT, 
	MAX_SUBSCRIPTION_POST_COUNT,
	UI_DEFAULTS,
	PLACEHOLDERS 
} from '../constants';

export class NaverBlogSettingTab extends PluginSettingTab {
	plugin: any; // NaverBlogPlugin type

	constructor(app: App, plugin: any) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: this.plugin.i18n.t('settings.title') });

		containerEl.createEl('h3', { text: this.plugin.i18n.t('settings.ai_configuration') });

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
					this.plugin.settings.aiModel = this.plugin.getDefaultModelForProvider(value);
					await this.plugin.saveSettings();
					
					// Refresh models for the new provider
					if (value !== 'ollama') {
						this.plugin.refreshModels(value as 'openai' | 'anthropic' | 'google').catch((error: any) => {
							console.log(`Failed to refresh models for ${value}:`, error);
						});
					}
					
					this.display(); // Refresh settings to show appropriate API key field and model
				}));

		const modelSetting = new Setting(containerEl)
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
			case 'openai':
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
				
			case 'anthropic':
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
				
			case 'google':
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
				
			case 'ollama':
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

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.default_folder'))
			.setDesc(this.plugin.i18n.t('settings.default_folder_desc'))
			.addText(text => {
				const input = text
					.setPlaceholder(PLACEHOLDERS.folder.default)
					.setValue(this.plugin.settings.defaultFolder)
					.onChange(async (value) => {
						this.plugin.settings.defaultFolder = value;
						await this.plugin.saveSettings();
					});
				
				// Add folder dropdown functionality
				this.setupFolderDropdown(input.inputEl, (folder) => {
					this.plugin.settings.defaultFolder = folder;
					this.plugin.saveSettings();
					input.setValue(folder);
				}, () => {
					this.plugin.settings.defaultFolder = '';
					this.plugin.saveSettings();
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
							this.plugin.settings.imageFolder = value;
							await this.plugin.saveSettings();
						});
					
					// Add folder dropdown functionality
					this.setupFolderDropdown(input.inputEl, (folder) => {
						this.plugin.settings.imageFolder = folder;
						this.plugin.saveSettings();
						input.setValue(folder);
					}, () => {
						this.plugin.settings.imageFolder = '';
						this.plugin.saveSettings();
						input.setValue('');
					});
					
					return input;
				});
		}


		containerEl.createEl('h3', { text: this.plugin.i18n.t('settings.subscribed_blogs') });
		
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
	}

	displaySubscriptions(containerEl: HTMLElement) {
		containerEl.empty();
		
		if (this.plugin.settings.subscribedBlogs.length === 0) {
			containerEl.createEl('p', { text: this.plugin.i18n.t('settings.no_subscribed_blogs') });
			return;
		}

		this.plugin.settings.subscribedBlogs.forEach((blogId: string, index: number) => {
			const blogDiv = containerEl.createDiv();
			blogDiv.style.display = 'grid';
			blogDiv.style.gridTemplateColumns = '1fr auto auto auto';
			blogDiv.style.gap = UI_DEFAULTS.modalGap;
			blogDiv.style.alignItems = 'center';
			blogDiv.style.padding = UI_DEFAULTS.modalPadding;
			blogDiv.style.border = '1px solid var(--background-modifier-border)';
			blogDiv.style.borderRadius = '4px';
			blogDiv.style.marginBottom = '5px';
			
			// Blog ID
			blogDiv.createEl('span', { text: blogId });
			
			// Post count setting
			const countDiv = blogDiv.createDiv();
			countDiv.style.display = 'flex';
			countDiv.style.alignItems = 'center';
			countDiv.style.gap = '5px';
			
			const countLabel = countDiv.createEl('span', { text: this.plugin.i18n.t('settings.posts_label') + ':' });
			countLabel.style.fontSize = '0.9em';
			countLabel.style.color = 'var(--text-muted)';
			
			const blogSubscription = this.plugin.settings.blogSubscriptions.find((sub: any) => sub.blogId === blogId);
			const currentCount = blogSubscription?.postCount || DEFAULT_BLOG_POST_COUNT;
			
			const countInput = countDiv.createEl('input', {
				type: 'number',
				value: currentCount.toString()
			});
			countInput.style.width = '60px';
			countInput.style.padding = '2px 4px';
			countInput.style.fontSize = '0.9em';
			countInput.min = '1';
			countInput.max = MAX_SUBSCRIPTION_POST_COUNT.toString();
			
			countInput.onchange = async () => {
				const newCount = parseInt(countInput.value) || DEFAULT_BLOG_POST_COUNT;
				
				// Update or create blog subscription
				const existingIndex = this.plugin.settings.blogSubscriptions.findIndex((sub: any) => sub.blogId === blogId);
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
			const syncButton = blogDiv.createEl('button', { text: this.plugin.i18n.t('settings.sync_button') });
			syncButton.style.fontSize = '0.8em';
			syncButton.style.padding = '4px 8px';
			syncButton.onclick = async () => {
				try {
					new Notice(`Syncing ${blogId}...`);
					const posts = await this.plugin.fetchNaverBlogPosts(blogId, currentCount);
					
					let successCount = 0;
					for (const post of posts) {
						try {
							await this.plugin.createMarkdownFile(post);
							successCount++;
						} catch (error) {
							console.error(`Failed to save post ${post.logNo}:`, error);
						}
					}
					
					new Notice(`✓ Synced ${successCount} posts from ${blogId}`);
				} catch (error) {
					new Notice(`✗ Failed to sync ${blogId}: ${error.message}`);
					console.error('Sync error:', error);
				}
			};
			
			// Remove button
			const removeButton = blogDiv.createEl('button', { text: this.plugin.i18n.t('settings.remove_button') });
			removeButton.style.fontSize = '0.8em';
			removeButton.style.padding = '4px 8px';
			removeButton.style.backgroundColor = 'var(--interactive-accent)';
			removeButton.style.color = 'var(--text-on-accent)';
			removeButton.onclick = async () => {
				// Remove from subscribed blogs
				this.plugin.settings.subscribedBlogs.splice(index, 1);
				
				// Remove from blog subscriptions
				const subIndex = this.plugin.settings.blogSubscriptions.findIndex((sub: any) => sub.blogId === blogId);
				if (subIndex >= 0) {
					this.plugin.settings.blogSubscriptions.splice(subIndex, 1);
				}
				
				await this.plugin.saveSettings();
				this.displaySubscriptions(containerEl);
			};
		});
	}

	getAllFolders(): string[] {
		const folders: string[] = [''];
		const abstractFiles = this.app.vault.getAllLoadedFiles();
		
		for (const file of abstractFiles) {
			if (file instanceof TFolder) { // This is a folder
				folders.push(file.path);
			}
		}
		
		return folders.sort();
	}

	setupFolderDropdown(inputEl: HTMLInputElement, onSelect: (folder: string) => void, onClear?: () => void) {
		let dropdownEl: HTMLElement | null = null;
		let isDropdownVisible = false;
		let searchIcon: HTMLElement | null = null;
		let clearButton: HTMLElement | null = null;

		// Create wrapper container for input with icons
		const wrapper = document.createElement('div');
		wrapper.style.cssText = `
			position: relative;
			display: flex;
			align-items: center;
		`;

		// Insert wrapper before input and move input into it
		inputEl.parentNode?.insertBefore(wrapper, inputEl);
		wrapper.appendChild(inputEl);

		// Create search icon
		searchIcon = document.createElement('div');
		searchIcon.innerHTML = '🔍';
		searchIcon.style.cssText = `
			position: absolute;
			left: 8px;
			top: 50%;
			transform: translateY(-50%);
			color: var(--text-muted);
			pointer-events: none;
			z-index: 1;
		`;
		wrapper.appendChild(searchIcon);

		// Add padding to input for search icon
		inputEl.style.paddingLeft = '32px';

		// Create clear button (initially hidden)
		const updateClearButton = () => {
			if (clearButton) {
				clearButton.remove();
				clearButton = null;
			}

			if (inputEl.value.trim() && onClear) {
				clearButton = document.createElement('div');
				clearButton.innerHTML = '×';
				clearButton.style.cssText = `
					position: absolute;
					right: 8px;
					top: 50%;
					transform: translateY(-50%);
					color: var(--text-muted);
					cursor: pointer;
					font-size: 16px;
					font-weight: bold;
					z-index: 1;
					width: 16px;
					height: 16px;
					display: flex;
					align-items: center;
					justify-content: center;
					border-radius: 50%;
					transition: all 0.1s;
				`;

				clearButton.addEventListener('mouseenter', () => {
					if (clearButton) {
						clearButton.style.backgroundColor = 'var(--background-modifier-hover)';
						clearButton.style.color = 'var(--text-normal)';
					}
				});

				clearButton.addEventListener('mouseleave', () => {
					if (clearButton) {
						clearButton.style.backgroundColor = '';
						clearButton.style.color = 'var(--text-muted)';
					}
				});

				clearButton.addEventListener('click', (e) => {
					e.preventDefault();
					e.stopPropagation();
					if (onClear) {
						onClear();
					}
					updateClearButton();
				});

				wrapper.appendChild(clearButton);
				inputEl.style.paddingRight = '28px';
			} else {
				inputEl.style.paddingRight = '';
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
			dropdownEl.className = 'folder-dropdown';
			dropdownEl.style.cssText = `
				position: absolute;
				top: '100%';
				left: 0;
				width: ${inputEl.offsetWidth}px;
				max-height: 200px;
				overflow-y: auto;
				background: var(--background-primary);
				border: 1px solid var(--background-modifier-border);
				border-radius: 6px;
				box-shadow: var(--shadow-s);
				z-index: ${UI_DEFAULTS.dropdownZIndex};
				margin-top: 2px;
			`;

			filteredFolders.forEach((folder, index) => {
				const itemEl = document.createElement('div');
				itemEl.className = 'folder-dropdown-item';
				itemEl.textContent = folder || '(Root)';
				itemEl.style.cssText = `
					padding: 8px 12px;
					cursor: pointer;
					border-bottom: 1px solid var(--background-modifier-border);
					transition: background-color 0.1s;
					white-space: nowrap;
					overflow: hidden;
					text-overflow: ellipsis;
					font-size: 13px;
					line-height: 1.3;
				`;

				if (index === filteredFolders.length - 1) {
					itemEl.style.borderBottom = 'none';
				}

				itemEl.addEventListener('mouseenter', () => {
					itemEl.style.backgroundColor = 'var(--background-modifier-hover)';
				});

				itemEl.addEventListener('mouseleave', () => {
					itemEl.style.backgroundColor = '';
				});

				itemEl.addEventListener('click', () => {
					onSelect(folder);
					this.hideDropdown();
					updateClearButton();
				});

				dropdownEl.appendChild(itemEl);
			});

			// Position the dropdown relative to the wrapper
			wrapper.style.position = 'relative';
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