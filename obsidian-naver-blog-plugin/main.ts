import { 
	App, 
	Plugin, 
	PluginSettingTab, 
	Setting, 
	Modal, 
	Notice, 
	TFile,
	requestUrl,
	RequestUrlParam
} from 'obsidian';

import { NaverBlogFetcher, NaverBlogPost } from './naver-blog-fetcher';

interface NaverBlogSettings {
	openaiApiKey: string;
	defaultFolder: string;
	enableAiTags: boolean;
	enableAiExcerpt: boolean;
}

const DEFAULT_SETTINGS: NaverBlogSettings = {
	openaiApiKey: '',
	defaultFolder: 'Naver Blog Posts',
	enableAiTags: true,
	enableAiExcerpt: true
}

interface ProcessedBlogPost extends NaverBlogPost {
	tags: string[];
	excerpt: string;
}

export default class NaverBlogPlugin extends Plugin {
	settings: NaverBlogSettings;

	async onload() {
		await this.loadSettings();

		// Add ribbon icon
		this.addRibbonIcon('download', 'Import Naver Blog', (evt: MouseEvent) => {
			new NaverBlogImportModal(this.app, this).open();
		});

		// Add command
		this.addCommand({
			id: 'import-naver-blog',
			name: 'Import from Naver Blog',
			callback: () => {
				new NaverBlogImportModal(this.app, this).open();
			}
		});

		// Add settings tab
		this.addSettingTab(new NaverBlogSettingTab(this.app, this));
	}

	onunload() {
		// Cleanup if needed
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async fetchNaverBlogPosts(blogId: string): Promise<ProcessedBlogPost[]> {
		try {
			new Notice('Fetching blog posts...');
			
			const fetcher = new NaverBlogFetcher(blogId);
			const posts = await fetcher.fetchPosts();
			
			new Notice(`Found ${posts.length} posts. Processing...`);
			
			// Convert to ProcessedBlogPost with empty tags and excerpt
			const processedPosts: ProcessedBlogPost[] = posts.map(post => ({
				...post,
				tags: [],
				excerpt: ''
			}));
			
			return processedPosts;
			
		} catch (error) {
			console.error('Error fetching blog posts:', error);
			new Notice('Failed to fetch blog posts. Please check the blog ID.');
			return [];
		}
	}

	async generateAITags(title: string, content: string): Promise<string[]> {
		if (!this.settings.enableAiTags || !this.settings.openaiApiKey) {
			return [];
		}

		try {
			const response = await requestUrl({
				url: 'https://api.openai.com/v1/chat/completions',
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.settings.openaiApiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: 'gpt-4o-mini',
					messages: [
						{
							role: 'system',
							content: '당신은 블로그 태그 생성 전문가입니다. 한국어 블로그 글을 분석하여 적절한 태그를 추천합니다.'
						},
						{
							role: 'user',
							content: `다음 블로그 글의 제목과 내용을 분석하여 적절한 태그를 생성해주세요.

제목: ${title}
내용: ${content.substring(0, 2000)}

요구사항:
1. 한국어 태그로 생성
2. 3-7개의 태그 추천
3. 글의 핵심 주제와 내용을 반영
4. 일반적인 블로그 태그 형식 사용

응답 형식: JSON 배열로만 응답 (예: ["리뷰", "기술", "일상"])`
						}
					],
					max_tokens: 100,
					temperature: 0.3
				})
			});

			const data = response.json;
			const content_text = data.choices[0].message.content.trim();
			
			try {
				const tags = JSON.parse(content_text);
				return Array.isArray(tags) ? tags : [];
			} catch (parseError) {
				// Fallback parsing
				const matches = content_text.match(/\[(.*?)\]/);
				if (matches) {
					return matches[1].split(',').map((tag: string) => tag.trim().replace(/"/g, ''));
				}
				return [];
			}
		} catch (error) {
			console.error('Error generating AI tags:', error);
			return [];
		}
	}

	async generateAIExcerpt(title: string, content: string): Promise<string> {
		if (!this.settings.enableAiExcerpt || !this.settings.openaiApiKey) {
			return '';
		}

		try {
			const response = await requestUrl({
				url: 'https://api.openai.com/v1/chat/completions',
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.settings.openaiApiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: 'gpt-4o-mini',
					messages: [
						{
							role: 'system',
							content: '당신은 블로그 요약 전문가입니다. 한국어 블로그 글을 분석하여 매력적인 요약을 작성합니다.'
						},
						{
							role: 'user',
							content: `다음 블로그 글의 제목과 내용을 분석하여 적절한 요약(excerpt)을 생성해주세요.

제목: ${title}
내용: ${content.substring(0, 1500)}

요구사항:
1. 한국어로 작성
2. 1-2문장으로 간결하게 요약
3. 글의 핵심 내용과 목적을 포함
4. 독자의 관심을 끌 수 있도록 작성
5. 따옴표 없이 본문만 응답`
						}
					],
					max_tokens: 150,
					temperature: 0.3
				})
			});

			const data = response.json;
			return data.choices[0].message.content.trim();
		} catch (error) {
			console.error('Error generating AI excerpt:', error);
			return '';
		}
	}

	async createMarkdownFile(post: ProcessedBlogPost): Promise<void> {
		try {
			// Generate AI tags and excerpt if enabled
			if (this.settings.enableAiTags) {
				post.tags = await this.generateAITags(post.title, post.content);
			}
			
			if (this.settings.enableAiExcerpt) {
				post.excerpt = await this.generateAIExcerpt(post.title, post.content);
			}

			// Create filename
			const filename = this.sanitizeFilename(`${post.date}-${post.title}.md`);
			const folder = this.settings.defaultFolder;
			
			// Ensure folder exists
			if (!await this.app.vault.adapter.exists(folder)) {
				await this.app.vault.createFolder(folder);
			}
			
			const filepath = `${folder}/${filename}`;

			// Create frontmatter
			const frontmatter = this.createFrontmatter(post);
			
			// Create full content
			const fullContent = `${frontmatter}\n${post.content}`;

			// Create the file
			await this.app.vault.create(filepath, fullContent);
			
			new Notice(`Created: ${filename}`);
		} catch (error) {
			console.error('Error creating markdown file:', error);
			new Notice(`Failed to create file for: ${post.title}`);
		}
	}

	createFrontmatter(post: ProcessedBlogPost): string {
		const tags = post.tags.length > 0 ? post.tags.map(tag => `"${tag}"`).join(', ') : '';
		const excerpt = post.excerpt ? `"${post.excerpt.replace(/"/g, '\\"')}"` : '""';
		
		return `---
title: "${post.title}"
filename: "${post.date}-${this.sanitizeFilename(post.title)}"
date: ${post.date}
share: true
categories: [IT, 개발, 생활]
tags: [${tags}]
excerpt: ${excerpt}
source: "네이버 블로그"
logNo: "${post.logNo}"
---`;
	}

	sanitizeFilename(filename: string): string {
		return filename
			.replace(/[<>:"/\\|?*]/g, '')
			.replace(/\s+/g, '-')
			.substring(0, 100);
	}
}

class NaverBlogImportModal extends Modal {
	plugin: NaverBlogPlugin;
	blogId: string = '';

	constructor(app: App, plugin: NaverBlogPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Import from Naver Blog" });

		let inputElement: HTMLInputElement;

		new Setting(contentEl)
			.setName("Blog ID")
			.setDesc("Enter the Naver Blog ID (e.g., 'yonofbooks')")
			.addText(text => {
				inputElement = text.inputEl;
				text.setPlaceholder("Blog ID")
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
				.setButtonText("Import Posts")
				.setCta()
				.onClick(async () => {
					this.handleImport();
				}));

		// Focus on input when modal opens
		setTimeout(() => {
			if (inputElement) {
				inputElement.focus();
			}
		}, 100);
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
		try {
			new Notice("Starting import...");
			
			const posts = await this.plugin.fetchNaverBlogPosts(this.blogId);
			
			if (posts.length === 0) {
				new Notice("No posts found or failed to fetch posts");
				return;
			}

			for (const post of posts) {
				await this.plugin.createMarkdownFile(post);
				// Add small delay to avoid overwhelming the API
				await new Promise(resolve => setTimeout(resolve, 500));
			}
			
			new Notice(`Successfully imported ${posts.length} posts!`);
		} catch (error) {
			console.error('Import error:', error);
			new Notice("Import failed. Please check the console for details.");
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class NaverBlogSettingTab extends PluginSettingTab {
	plugin: NaverBlogPlugin;

	constructor(app: App, plugin: NaverBlogPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Naver Blog Importer Settings' });

		new Setting(containerEl)
			.setName('OpenAI API Key')
			.setDesc('Enter your OpenAI API key for AI-generated tags and excerpts')
			.addText(text => text
				.setPlaceholder('sk-...')
				.setValue(this.plugin.settings.openaiApiKey)
				.onChange(async (value) => {
					this.plugin.settings.openaiApiKey = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Default Folder')
			.setDesc('Folder where imported posts will be saved')
			.addText(text => text
				.setPlaceholder('Naver Blog Posts')
				.setValue(this.plugin.settings.defaultFolder)
				.onChange(async (value) => {
					this.plugin.settings.defaultFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable AI Tags')
			.setDesc('Generate tags using AI (requires OpenAI API key)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAiTags)
				.onChange(async (value) => {
					this.plugin.settings.enableAiTags = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable AI Excerpt')
			.setDesc('Generate excerpts using AI (requires OpenAI API key)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAiExcerpt)
				.onChange(async (value) => {
					this.plugin.settings.enableAiExcerpt = value;
					await this.plugin.saveSettings();
				}));
	}
}