import { App, PluginSettingTab, Setting, Notice, normalizePath } from 'obsidian';

import {
	DEFAULT_BLOG_POST_COUNT,
	MAX_POST_IMPORT_LIMIT,
	MAX_SUBSCRIPTION_POST_COUNT,
	PLACEHOLDERS
} from '../constants';
import { AIProviderUtils } from '../utils/ai-provider-utils';
import { BrunchFetcher } from '../../brunch-fetcher';
import { NaverBlogFetcher } from '../../naver-blog-fetcher';
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

		// Naver Blog Subscriptions section
		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.naver_blog_subscriptions'))
			.setHeading();
		
		const subscriptionDiv = containerEl.createDiv();
		this.displaySubscriptions(subscriptionDiv);

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.add_blog_id'))
			.setDesc(this.plugin.i18n.t('settings.add_blog_id_desc'))
			.addText(text => {
				text.setPlaceholder(this.plugin.i18n.t('settings.blog_id_placeholder'));
				return text;
			})
			.addButton(button => button
				.setButtonText(this.plugin.i18n.t('settings.add_button'))
				.onClick(async () => {
					const input = button.buttonEl.previousElementSibling as HTMLInputElement;
					const inputValue = input.value.trim();

					// Parse blog ID from URL or direct input
					const blogId = NaverBlogFetcher.parseBlogIdFromInput(inputValue);
					if (!blogId) {
						new Notice(this.plugin.i18n.t('notices.invalid_blog_id'));
						return;
					}

					// Check if already subscribed
					if (this.plugin.settings.subscribedBlogs.includes(blogId)) {
						new Notice(`Already subscribed to ${blogId}`);
						return;
					}

					// Fetch profile info
					new Notice(this.plugin.i18n.t('notices.fetching_profile'), 2000);
					const profile = await NaverBlogFetcher.fetchProfileInfoStatic(blogId);

					this.plugin.settings.subscribedBlogs.push(blogId);

					// Initialize blog subscription with metadata
					this.plugin.settings.blogSubscriptions.push({
						id: `naver-${blogId}-${Date.now()}`,
						blogId: blogId,
						blogName: profile.nickname,
						profileImageUrl: profile.profileImageUrl,
						bio: profile.bio,
						postCount: DEFAULT_BLOG_POST_COUNT,
						createdAt: new Date().toISOString()
					});

					await this.plugin.saveSettings();
					input.value = '';
					this.displaySubscriptions(subscriptionDiv);
					new Notice(`Subscribed to ${profile.nickname} (${blogId})`);
				}));

		// Brunch Subscriptions section
		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.brunch_subscriptions'))
			.setHeading();

		const brunchSubscriptionDiv = containerEl.createDiv();
		this.displayBrunchSubscriptions(brunchSubscriptionDiv);

		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.add_brunch_author'))
			.setDesc(this.plugin.i18n.t('settings.add_brunch_author_desc'))
			.addText(text => {
				text.setPlaceholder(this.plugin.i18n.t('settings.brunch_author_placeholder'));
				return text;
			})
			.addButton(button => button
				.setButtonText(this.plugin.i18n.t('settings.add_button'))
				.onClick(async () => {
					const input = button.buttonEl.previousElementSibling as HTMLInputElement;
					const authorUsername = input.value.trim().replace(/^@/, '');
					if (!authorUsername) return;

					// Check if already subscribed
					const existing = this.plugin.settings.brunchSettings?.subscribedBrunchAuthors?.find(
						sub => sub.authorUsername === authorUsername
					);
					if (existing) {
						new Notice(`Already subscribed to @${authorUsername}`);
						return;
					}

					// Add subscription
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
					const profile = await BrunchFetcher.fetchAuthorProfile(authorUsername);

					const newSubscription = {
						id: `brunch-${authorUsername}-${Date.now()}`,
						platform: 'brunch' as const,
						authorUsername: authorUsername,
						authorName: profile.authorName,
						authorTitle: profile.authorTitle,
						authorDescription: profile.authorDescription,
						profileImageUrl: profile.profileImageUrl,
						subscriberCount: profile.subscriberCount,
						postCount: DEFAULT_BLOG_POST_COUNT,
						createdAt: new Date().toISOString()
					};

					this.plugin.settings.brunchSettings.subscribedBrunchAuthors.push(newSubscription);
					await this.plugin.saveSettings();
					input.value = '';
					this.displayBrunchSubscriptions(brunchSubscriptionDiv);
					new Notice(`Subscribed to @${authorUsername} (${profile.authorName})`);
				}));

		// Naver cafe section
		new Setting(containerEl)
			.setName('Naver Cafe')
			.setHeading();

		// Cookie description
		const cookieDesc = document.createDocumentFragment();
		cookieDesc.appendText('For private/member-only cafes. ');
		cookieDesc.createEl('br');
		cookieDesc.appendText('Get from Chrome: F12 → Application → Cookies → naver.com');

		new Setting(containerEl)
			.setName('Cookie')
			.setDesc(cookieDesc);

		// NID_AUT input
		new Setting(containerEl)
			.setName('NID_AUT')
			.setDesc('Copy the NID_AUT cookie value')
			.addText(text => text
				.setPlaceholder('Paste NID_AUT value')
				.setValue(this.plugin.settings.cafeSettings?.nidAut || '')
				.onChange(async (value) => {
					const cafeSettings = this.ensureCafeSettings();
					// Clean the value - remove "NID_AUT=" prefix if user pasted it
					const cleanValue = value.replace(/^NID_AUT\s*=\s*/i, '').trim();
					cafeSettings.nidAut = cleanValue;
					this.updateCookieString();
					await this.plugin.saveSettings();
				}));

		// NID_SES input
		new Setting(containerEl)
			.setName('NID_SES')
			.setDesc('Copy the NID_SES cookie value')
			.addText(text => text
				.setPlaceholder('Paste NID_SES value')
				.setValue(this.plugin.settings.cafeSettings?.nidSes || '')
				.onChange(async (value) => {
					const cafeSettings = this.ensureCafeSettings();
					// Clean the value - remove "NID_SES=" prefix if user pasted it
					const cleanValue = value.replace(/^NID_SES\s*=\s*/i, '').trim();
					cafeSettings.nidSes = cleanValue;
					this.updateCookieString();
					await this.plugin.saveSettings();
				}));

		// Include comments toggle
		new Setting(containerEl)
			.setName('Include comments')
			.setDesc('Include comments at the bottom of imported cafe posts')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.cafeSettings?.includeComments ?? true)
				.onChange(async (value) => {
					const cafeSettings = this.ensureCafeSettings();
					cafeSettings.includeComments = value;
					await this.plugin.saveSettings();
				}));

		// Naver News settings section
		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.news_settings'))
			.setHeading();

		// Organize by press toggle
		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.news_organize_by_press'))
			.setDesc(this.plugin.i18n.t('settings.news_organize_by_press_desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.newsSettings?.organizeByPress ?? true)
				.onChange(async (value) => {
					const newsSettings = this.ensureNewsSettings();
					newsSettings.organizeByPress = value;
					await this.plugin.saveSettings();
				}));

		// Download news images toggle
		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.news_download_images'))
			.setDesc(this.plugin.i18n.t('settings.news_download_images_desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.newsSettings?.downloadNewsImages ?? true)
				.onChange(async (value) => {
					const newsSettings = this.ensureNewsSettings();
					newsSettings.downloadNewsImages = value;
					await this.plugin.saveSettings();
				}));

		// Include news comments toggle
		new Setting(containerEl)
			.setName(this.plugin.i18n.t('settings.news_include_comments'))
			.setDesc(this.plugin.i18n.t('settings.news_include_comments_desc'))
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.newsSettings?.includeNewsComments ?? false)
				.onChange(async (value) => {
					const newsSettings = this.ensureNewsSettings();
					newsSettings.includeNewsComments = value;
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
			const subscription = this.plugin.settings.blogSubscriptions.find(sub => sub.blogId === blogId);
			const currentCount = subscription?.postCount || DEFAULT_BLOG_POST_COUNT;

			const card = containerEl.createDiv({ cls: 'naver-subscription-card' });

			// Header with profile image, info, and controls
			const header = card.createDiv({ cls: 'naver-subscription-header' });

			// Profile image
			if (subscription?.profileImageUrl) {
				const imgWrapper = header.createDiv({ cls: 'naver-profile-image' });
				const img = imgWrapper.createEl('img', {
					attr: { src: subscription.profileImageUrl, alt: subscription.blogName || blogId }
				});
				img.onerror = () => {
					imgWrapper.empty();
					imgWrapper.createEl('span', { text: '📝', cls: 'naver-profile-placeholder' });
				};
			} else {
				const imgWrapper = header.createDiv({ cls: 'naver-profile-image' });
				imgWrapper.createEl('span', { text: '📝', cls: 'naver-profile-placeholder' });
			}

			// Author info
			const infoDiv = header.createDiv({ cls: 'naver-author-info' });

			// Author name and blogId
			const nameRow = infoDiv.createDiv({ cls: 'naver-author-name-row' });
			nameRow.createEl('span', {
				text: subscription?.blogName || blogId,
				cls: 'naver-author-name'
			});
			if (subscription?.blogName && subscription.blogName !== blogId) {
				nameRow.createEl('span', {
					text: blogId,
					cls: 'naver-author-blogid'
				});
			}

			// Bio (description)
			if (subscription?.bio) {
				infoDiv.createEl('div', {
					text: subscription.bio,
					cls: 'naver-author-bio',
					attr: { title: subscription.bio }
				});
			}

			// Controls (right side of header)
			const controlsDiv = header.createDiv({ cls: 'naver-subscription-controls' });

			// Post count
			const countDiv = controlsDiv.createDiv({ cls: 'naver-post-count' });
			const countInput = countDiv.createEl('input', {
				type: 'number',
				value: currentCount.toString(),
				cls: 'naver-count-input'
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
						id: `naver-${blogId}-${Date.now()}`,
						blogId: blogId,
						postCount: newCount,
						createdAt: new Date().toISOString()
					});
				}

				await this.plugin.saveSettings();
			};

			// Buttons
			const buttonsDiv = controlsDiv.createDiv({ cls: 'naver-subscription-buttons' });

			const syncButton = buttonsDiv.createEl('button', {
				text: this.plugin.i18n.t('settings.sync_button'),
				cls: 'naver-sync-button'
			});
			syncButton.onclick = async () => {
				try {
					new Notice(`Syncing ${subscription?.blogName || blogId}...`);
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

					// Update lastSyncedAt
					const subIndex = this.plugin.settings.blogSubscriptions.findIndex(sub => sub.blogId === blogId);
					if (subIndex >= 0) {
						this.plugin.settings.blogSubscriptions[subIndex].lastSyncedAt = new Date().toISOString();
						await this.plugin.saveSettings();
					}

					// Refresh display to show updated metadata
					this.displaySubscriptions(containerEl);

					new Notice(`Synced ${successCount} posts from ${subscription?.blogName || blogId}`);
				} catch (error) {
					new Notice(`Failed to sync ${blogId}: ${error.message}`);
				}
			};

			const removeButton = buttonsDiv.createEl('button', {
				text: this.plugin.i18n.t('settings.remove_button'),
				cls: 'naver-remove-button'
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
				new Notice(`Unsubscribed from ${subscription?.blogName || blogId}`);
			};

			// Metadata footer
			const metaParts: string[] = [];
			if (subscription?.createdAt) {
				metaParts.push(`Added: ${new Date(subscription.createdAt).toLocaleDateString()}`);
			}
			if (subscription?.lastSyncedAt) {
				metaParts.push(`Last sync: ${new Date(subscription.lastSyncedAt).toLocaleDateString()}`);
			}
			if (metaParts.length > 0) {
				card.createEl('div', {
					text: metaParts.join(' · '),
					cls: 'naver-subscription-meta'
				});
			}
		});
	}

	displayBrunchSubscriptions(containerEl: HTMLElement) {
		containerEl.empty();

		const subscriptions = this.plugin.settings.brunchSettings?.subscribedBrunchAuthors || [];

		if (subscriptions.length === 0) {
			containerEl.createEl('p', { text: this.plugin.i18n.t('settings.no_subscribed_brunch') });
			return;
		}

		subscriptions.forEach((subscription, index) => {
			const card = containerEl.createDiv({ cls: 'brunch-subscription-card' });

			// Header with profile image, info, and controls
			const header = card.createDiv({ cls: 'brunch-subscription-header' });

			// Profile image
			if (subscription.profileImageUrl) {
				const imgWrapper = header.createDiv({ cls: 'brunch-profile-image' });
				const img = imgWrapper.createEl('img', {
					attr: { src: subscription.profileImageUrl, alt: subscription.authorName || subscription.authorUsername }
				});
				img.onerror = () => {
					imgWrapper.empty();
					imgWrapper.createEl('span', { text: '🥐', cls: 'brunch-profile-placeholder' });
				};
			} else {
				const imgWrapper = header.createDiv({ cls: 'brunch-profile-image' });
				imgWrapper.createEl('span', { text: '🥐', cls: 'brunch-profile-placeholder' });
			}

			// Author info
			const infoDiv = header.createDiv({ cls: 'brunch-author-info' });

			// Author name and username
			const nameRow = infoDiv.createDiv({ cls: 'brunch-author-name-row' });
			nameRow.createEl('span', {
				text: subscription.authorName || subscription.authorUsername,
				cls: 'brunch-author-name'
			});
			nameRow.createEl('span', {
				text: `@${subscription.authorUsername}`,
				cls: 'brunch-author-username'
			});

			// Second row: title, description, subscriber count (inline)
			const detailParts: string[] = [];
			if (subscription.authorTitle) {
				detailParts.push(subscription.authorTitle);
			}
			if (subscription.authorDescription) {
				detailParts.push(subscription.authorDescription);
			}
			if (subscription.subscriberCount) {
				detailParts.push(`구독자 ${subscription.subscriberCount.toLocaleString()}명`);
			}
			if (detailParts.length > 0) {
				infoDiv.createEl('div', {
					text: detailParts.join(' · '),
					cls: 'brunch-author-title'
				});
			}

			// Controls (right side of header)
			const controlsDiv = header.createDiv({ cls: 'brunch-subscription-controls' });

			// Post count
			const countDiv = controlsDiv.createDiv({ cls: 'brunch-post-count' });
			const countInput = countDiv.createEl('input', {
				type: 'number',
				value: subscription.postCount.toString(),
				cls: 'brunch-count-input'
			});
			countInput.min = '1';
			countInput.max = MAX_SUBSCRIPTION_POST_COUNT.toString();
			countInput.onchange = async () => {
				const newCount = parseInt(countInput.value) || DEFAULT_BLOG_POST_COUNT;
				subscription.postCount = newCount;
				await this.plugin.saveSettings();
			};

			// Buttons
			const buttonsDiv = controlsDiv.createDiv({ cls: 'brunch-subscription-buttons' });

			const syncButton = buttonsDiv.createEl('button', {
				text: this.plugin.i18n.t('settings.sync_button'),
				cls: 'brunch-sync-button'
			});
			syncButton.onclick = async () => {
				try {
					new Notice(`Syncing @${subscription.authorUsername}...`);
					await this.plugin.brunchService.syncSingleAuthor(subscription);
					subscription.lastCheckedAt = new Date().toISOString();
					await this.plugin.saveSettings();
					this.displayBrunchSubscriptions(containerEl);
					new Notice(`Synced posts from @${subscription.authorUsername}`);
				} catch (error) {
					new Notice(`Failed to sync: ${error.message}`);
				}
			};

			const removeButton = buttonsDiv.createEl('button', {
				text: this.plugin.i18n.t('settings.remove_button'),
				cls: 'brunch-remove-button'
			});
			removeButton.onclick = async () => {
				subscriptions.splice(index, 1);
				await this.plugin.saveSettings();
				this.displayBrunchSubscriptions(containerEl);
				new Notice(`Unsubscribed from @${subscription.authorUsername}`);
			};

			// Metadata footer
			const metaParts: string[] = [];
			if (subscription.createdAt) {
				metaParts.push(`Added: ${new Date(subscription.createdAt).toLocaleDateString()}`);
			}
			if (subscription.lastCheckedAt) {
				metaParts.push(`Last sync: ${new Date(subscription.lastCheckedAt).toLocaleDateString()}`);
			}
			if (metaParts.length > 0) {
				card.createEl('div', {
					text: metaParts.join(' · '),
					cls: 'brunch-subscription-meta'
				});
			}
		});
	}

	/**
	 * Ensure cafeSettings object exists and return it
	 */
	private ensureCafeSettings(): NonNullable<typeof this.plugin.settings.cafeSettings> {
		if (!this.plugin.settings.cafeSettings) {
			this.plugin.settings.cafeSettings = {
				naverCookie: '',
				nidAut: '',
				nidSes: '',
				cafeImportFolder: 'Naver Cafe Posts',
				includeComments: true,
				downloadCafeImages: true,
				excludeNotice: true,
				excludeRecommended: false,
				minContentLength: 0,
				subscribedCafes: [],
				enableCafeDuplicateCheck: true
			};
		}
		return this.plugin.settings.cafeSettings;
	}

	/**
	 * Ensure newsSettings object exists and return it
	 */
	private ensureNewsSettings(): NonNullable<typeof this.plugin.settings.newsSettings> {
		if (!this.plugin.settings.newsSettings) {
			this.plugin.settings.newsSettings = {
				newsFolder: 'NaverNews',
				organizeByPress: true,
				downloadNewsImages: true,
				newsImageFolder: 'attachments',
				includeNewsComments: false,
				includeOriginalUrl: true
			};
		}
		return this.plugin.settings.newsSettings;
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