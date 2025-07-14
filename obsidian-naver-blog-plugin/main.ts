import { 
	App, 
	Plugin, 
	PluginSettingTab, 
	Setting, 
	Modal, 
	Notice, 
	TFile,
	TFolder,
	requestUrl,
	RequestUrlParam
} from 'obsidian';

import { NaverBlogFetcher, NaverBlogPost } from './naver-blog-fetcher';

interface BlogSubscription {
	blogId: string;
	postCount: number;
}

interface NaverBlogSettings {
	openaiApiKey: string;
	defaultFolder: string;
	imageFolder: string;
	enableAiTags: boolean;
	enableAiExcerpt: boolean;
	enableDuplicateCheck: boolean;
	enableImageDownload: boolean;
	subscribedBlogs: string[];
	subscriptionCount: number;
	blogSubscriptions: BlogSubscription[];
}

const DEFAULT_SETTINGS: NaverBlogSettings = {
	openaiApiKey: '',
	defaultFolder: 'Naver Blog Posts',
	imageFolder: 'Naver Blog Posts/attachments',
	enableAiTags: true,
	enableAiExcerpt: true,
	enableDuplicateCheck: true,
	enableImageDownload: false,
	subscribedBlogs: [],
	subscriptionCount: 10,
	blogSubscriptions: []
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

		// Add commands
		this.addCommand({
			id: 'import-naver-blog',
			name: 'Import from Naver Blog',
			callback: () => {
				new NaverBlogImportModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'subscribe-naver-blog',
			name: 'Subscribe to Naver Blog',
			callback: () => {
				new NaverBlogSubscribeModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'import-single-post',
			name: 'Import Single Naver Blog Post',
			callback: () => {
				new NaverBlogSinglePostModal(this.app, this).open();
			}
		});

		this.addCommand({
			id: 'rewrite-current-note',
			name: 'AI Fix Layout and Format (Preserve Content 100%)',
			callback: async () => {
				// Check API key first
				if (!this.settings.openaiApiKey || this.settings.openaiApiKey.trim() === '') {
					new Notice('❌ OpenAI API Key required for AI formatting', 8000);
					new Notice('💡 Please set your API key in plugin settings', 5000);
					return;
				}

				const activeFile = this.app.workspace.getActiveFile();
				if (!activeFile) {
					new Notice('No active file selected for formatting');
					return;
				}

				if (!activeFile.path.endsWith('.md')) {
					new Notice('Please select a markdown file');
					return;
				}

				await this.rewriteCurrentNote(activeFile);
			}
		});

		// Auto-sync subscribed blogs on startup
		if (this.settings.subscribedBlogs.length > 0) {
			setTimeout(() => this.syncSubscribedBlogs(), 5000);
		}

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

	async fetchNaverBlogPosts(blogId: string, maxPosts?: number): Promise<ProcessedBlogPost[]> {
		let fetchNotice: Notice | null = null;
		try {
			fetchNotice = new Notice('Fetching blog posts...', 0); // Persistent notice
			
			const fetcher = new NaverBlogFetcher(blogId);
			const posts = await fetcher.fetchPosts(maxPosts);
			
			// Hide the persistent notice
			if (fetchNotice) {
				fetchNotice.hide();
				fetchNotice = null;
			}
			
			// Filter out duplicates if enabled
			let filteredPosts = posts;
			if (this.settings.enableDuplicateCheck) {
				const existingLogNos = await this.getExistingLogNos();
				filteredPosts = posts.filter(post => !existingLogNos.has(post.logNo));
				new Notice(`Found ${posts.length} posts, ${filteredPosts.length} new posts after duplicate check`, 4000);
			} else {
				new Notice(`Found ${posts.length} posts`, 4000);
			}
			
			new Notice(`Processing ${filteredPosts.length} posts...`, 3000);
			
			// Convert to ProcessedBlogPost with empty tags and excerpt
			const processedPosts: ProcessedBlogPost[] = filteredPosts.map(post => ({
				...post,
				title: post.title.replace(/^\[.*?\]\s*/, '').replace(/\s*\[.*?\]$/, '').trim(), // Remove [] brackets from title start/end
				tags: [],
				excerpt: ''
			}));
			
			return processedPosts;
			
		} catch (error) {
			// Hide the persistent notice on error
			if (fetchNotice) {
				fetchNotice.hide();
			}
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

			// Process images if enabled
			let processedContent = post.content;
			if (this.settings.enableImageDownload) {
				processedContent = await this.downloadAndProcessImages(post.content, post.logNo);
			}

			// Create filename - just title.md without date prefix and hyphen replacements
			const filename = this.sanitizeFilename(`${post.title}.md`);
			const folder = this.settings.defaultFolder;
			
			// Ensure folder exists
			if (!await this.app.vault.adapter.exists(folder)) {
				await this.app.vault.createFolder(folder);
			}
			
			const filepath = `${folder}/${filename}`;

			// Create frontmatter
			const frontmatter = this.createFrontmatter(post);
			
			// Create full content
			const fullContent = `${frontmatter}\n${processedContent}`;

			// Check if file already exists
			if (await this.app.vault.adapter.exists(filepath)) {
				console.log(`File already exists: ${filename}`);
				return;
			}
			
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
url: "${post.url}"
logNo: "${post.logNo}"
---`;
	}

	async downloadAndProcessImages(content: string, logNo: string): Promise<string> {
		if (!this.settings.enableImageDownload) {
			return content;
		}

		try {
			// Create attachments folder
			const attachmentsFolder = this.settings.imageFolder;
			if (!await this.app.vault.adapter.exists(attachmentsFolder)) {
				await this.app.vault.createFolder(attachmentsFolder);
			}

			// Find all image markdown patterns - filter out unwanted images
			const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
			let processedContent = content;
			let match;
			let imageCount = 0;
			const allMatches = [...content.matchAll(new RegExp(imageRegex.source, 'g'))];
			
			// Filter out unwanted images (GIFs, animations, editor assets)
			const filteredMatches = allMatches.filter(([_, altText, imageUrl]) => {
				return this.shouldDownloadImage(imageUrl, altText);
			});
			
			const totalImages = filteredMatches.length;

			if (totalImages > 0) {
				console.log(`Found ${totalImages} valid images to download for post ${logNo} (filtered from ${allMatches.length})`);
			}

			// Process only filtered images
			for (let i = 0; i < filteredMatches.length; i++) {
				const [fullMatch, altText, imageUrl] = filteredMatches[i];
				
				// Skip if already a local path
				if (imageUrl.startsWith('attachments/') || imageUrl.startsWith('./') || imageUrl.startsWith('../')) {
					continue;
				}

				try {
					// Convert Naver CDN URLs to direct URLs
					let directUrl = this.convertToDirectImageUrl(imageUrl);
					const imageProgress = `(${imageCount + 1}/${totalImages})`;
					
					console.log(`Processing image ${imageProgress}: ${imageUrl} -> ${directUrl}`);
					new Notice(`Downloading image ${imageProgress} for post ${logNo}`, 2000);
					
					// Download image
					const response = await requestUrl({
						url: directUrl,
						method: 'GET',
						headers: {
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
						}
					});

					if (response.status === 200 && response.arrayBuffer) {
						// Generate filename from original URL (better for Korean filenames)
						const originalUrlParts = imageUrl.split('/');
						let filename = originalUrlParts[originalUrlParts.length - 1];
						
						// Clean filename and add extension if missing
						filename = filename.split('?')[0]; // Remove query params
						
						// Decode URL-encoded Korean characters
						try {
							filename = decodeURIComponent(filename);
						} catch (e) {
							console.log('Could not decode filename, using as-is');
						}
						
						// If filename is too long or problematic, use a simpler name
						if (filename.length > 100 || !filename.includes('.')) {
							const extension = filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[1] || 'jpg';
							filename = `image_${Date.now()}.${extension}`;
						}
						
						// Add logNo prefix to avoid conflicts
						filename = `${logNo}_${imageCount}_${filename}`;
						filename = this.sanitizeFilename(filename);
						
						console.log(`Generated filename: ${filename}`);
						
						// Save image
						const imagePath = `${attachmentsFolder}/${filename}`;
						try {
							await this.app.vault.adapter.writeBinary(imagePath, response.arrayBuffer);
							
							// Verify file was saved
							const fileExists = await this.app.vault.adapter.exists(imagePath);
							console.log(`File saved successfully: ${fileExists} at ${imagePath}`);
							
							if (!fileExists) {
								throw new Error('File was not saved properly');
							}
						} catch (saveError) {
							console.error(`Failed to save image file: ${saveError}`);
							throw saveError;
						}
						
						// Update content with local path (relative to default folder)
						const defaultFolderPath = this.settings.defaultFolder;
						const imageFolderPath = this.settings.imageFolder;
						
						// Calculate relative path from default folder to image folder
						let relativePath = '';
						if (imageFolderPath.startsWith(defaultFolderPath)) {
							// Image folder is inside default folder
							relativePath = imageFolderPath.substring(defaultFolderPath.length + 1);
							if (relativePath) {
								relativePath = relativePath + '/';
							}
						} else {
							// Image folder is outside default folder, use relative path
							const defaultParts = defaultFolderPath.split('/');
							const imageParts = imageFolderPath.split('/');
							
							// Find common prefix
							let commonIndex = 0;
							while (commonIndex < defaultParts.length && 
								   commonIndex < imageParts.length && 
								   defaultParts[commonIndex] === imageParts[commonIndex]) {
								commonIndex++;
							}
							
							// Go up from default folder
							const upLevels = defaultParts.length - commonIndex;
							const upPath = '../'.repeat(upLevels);
							
							// Go down to image folder
							const downPath = imageParts.slice(commonIndex).join('/');
							
							relativePath = upPath + (downPath ? downPath + '/' : '');
						}
						
						const localImagePath = `${relativePath}${filename}`;
						const newImageMd = `![${altText}](${localImagePath})`;
						
						// Clean the original image URL from query parameters before replacing
						const cleanOriginalUrl = imageUrl.split('?')[0];
						processedContent = processedContent.replace(fullMatch, newImageMd);
						
						console.log(`Updated markdown: ${fullMatch} -> ${newImageMd}`);
						
						imageCount++;
						console.log(`✓ Downloaded image ${imageProgress}: ${filename}`);
					} else {
						console.log(`✗ Failed to download image ${imageProgress}: ${directUrl} (Status: ${response.status})`);
						console.log(`Response headers:`, response.headers);
					}
				} catch (imageError) {
					const imageProgress = `(${imageCount + 1}/${totalImages})`;
					let directUrl = this.convertToDirectImageUrl(imageUrl);
					console.error(`✗ Error downloading image ${imageProgress} ${imageUrl}:`, imageError);
					console.log(`Direct URL attempted: ${directUrl}`);
					
					// Try alternative download method for postfiles.pstatic.net
					if (imageUrl.includes('postfiles.pstatic.net')) {
						console.log(`Trying alternative method for postfiles.pstatic.net...`);
						try {
							const altResponse = await requestUrl({
								url: imageUrl, // Use original URL
								method: 'GET',
								headers: {
									'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
									'Referer': 'https://blog.naver.com/'
								}
							});
							
							if (altResponse.status === 200 && altResponse.arrayBuffer) {
								console.log(`✓ Alternative download successful for ${imageUrl}`);
								// Use same filename logic as above
								const urlParts = imageUrl.split('/');
								let filename = urlParts[urlParts.length - 1];
								filename = filename.split('?')[0];
								if (!filename.includes('.')) {
									filename += '.jpg';
								}
								filename = `${logNo}_${imageCount}_${filename}`;
								filename = this.sanitizeFilename(filename);
								
								const imagePath = `${attachmentsFolder}/${filename}`;
								await this.app.vault.adapter.writeBinary(imagePath, altResponse.arrayBuffer);
								
								const defaultFolderPath = this.settings.defaultFolder;
								const imageFolderPath = this.settings.imageFolder;
								let relativePath = '';
								if (imageFolderPath.startsWith(defaultFolderPath)) {
									relativePath = imageFolderPath.substring(defaultFolderPath.length + 1);
									if (relativePath) {
										relativePath = relativePath + '/';
									}
								} else {
									const defaultParts = defaultFolderPath.split('/');
									const imageParts = imageFolderPath.split('/');
									let commonIndex = 0;
									while (commonIndex < defaultParts.length && 
										   commonIndex < imageParts.length && 
										   defaultParts[commonIndex] === imageParts[commonIndex]) {
										commonIndex++;
									}
									const upLevels = defaultParts.length - commonIndex;
									const upPath = '../'.repeat(upLevels);
									const downPath = imageParts.slice(commonIndex).join('/');
									relativePath = upPath + (downPath ? downPath + '/' : '');
								}
								
								const localImagePath = `${relativePath}${filename}`;
								const newImageMd = `![${altText}](${localImagePath})`;
								processedContent = processedContent.replace(fullMatch, newImageMd);
								imageCount++;
								console.log(`✓ Downloaded image via alternative method ${imageProgress}: ${filename}`);
							}
						} catch (altError) {
							console.error(`Alternative download also failed:`, altError);
						}
					}
				}
			}

			return processedContent;
		} catch (error) {
			console.error('Error processing images:', error);
			return content; // Return original content on error
		}
	}

	async rewriteCurrentNote(file: TFile): Promise<void> {
		try {
			new Notice('🤖 AI layout fixing in progress...', 5000);
			
			// Read the current file content
			const content = await this.app.vault.read(file);
			
			// Extract frontmatter and body
			const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
			let frontmatter = '';
			let body = content;
			
			if (frontmatterMatch) {
				frontmatter = frontmatterMatch[1];
				body = frontmatterMatch[2];
			}
			
			// Clean the body content for AI processing (remove markdown syntax temporarily)
			const cleanBody = body
				.replace(/!\[([^\]]*)\]\([^)]*\)/g, '[이미지: $1]') // Replace images with placeholders
				.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // Remove links but keep text
				.replace(/[#*`]/g, '') // Remove markdown formatting
				.trim();
			
			if (!cleanBody || cleanBody.length < 50) {
				new Notice('Content too short for AI formatting (minimum 50 characters)');
				return;
			}

			// Call OpenAI for layout fixing
			const fixedContent = await this.callOpenAIForLayoutFix(cleanBody);
			
			if (!fixedContent) {
				new Notice('❌ AI formatting failed. Please try again.');
				return;
			}

			// Reconstruct the file with fixed content
			let newContent = '';
			if (frontmatter) {
				newContent = `---\n${frontmatter}\n---\n\n${fixedContent}`;
			} else {
				newContent = fixedContent;
			}

			// Write the fixed content back to the file
			await this.app.vault.modify(file, newContent);
			
			new Notice('✅ Layout and formatting fixed by AI!', 5000);
			
		} catch (error) {
			console.error('AI layout fix error:', error);
			
			// Provide specific error messages
			if (error.message.includes('401')) {
				new Notice('❌ Invalid OpenAI API Key', 8000);
				new Notice('💡 Please check your API key in plugin settings', 5000);
			} else if (error.message.includes('quota')) {
				new Notice('❌ OpenAI API quota exceeded', 8000);
				new Notice('💡 Please check your OpenAI billing settings', 5000);
			} else if (error.message.includes('network')) {
				new Notice('❌ Network error - please check your connection', 5000);
			} else {
				new Notice(`❌ AI formatting failed: ${error.message}`, 8000);
			}
		}
	}

	async callOpenAIForLayoutFix(content: string): Promise<string> {
		try {
			const response = await requestUrl({
				url: 'https://api.openai.com/v1/chat/completions',
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${this.settings.openaiApiKey}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					model: 'gpt-4o', // Using gpt-4o for better cost efficiency
					messages: [
						{
							role: 'user',
							content: `다음은 네이버 블로그에서 HTML 파싱으로 가져온 텍스트입니다. HTML 파싱 과정에서 레이아웃이 깨지고 형식이 망가진 부분을 수정해주세요.

⚠️ **중요**: 원문의 내용은 100% 그대로 유지하고, 오직 마크다운 형식과 레이아웃만 수정해주세요.

**수정 사항**:
1. 줄바꿈과 문단 구분을 자연스럽게 정리
2. 제목이 필요한 부분에 적절한 ## 또는 ### 추가  
3. 목록 형태의 내용은 - 또는 1. 형식으로 정리
4. 강조가 필요한 부분만 **볼드** 처리
5. 전체적인 마크다운 형식 정리

**절대 하지 말 것**:
- 내용 추가, 삭제, 변경 금지
- 의미나 뉘앙스 변경 금지  
- 새로운 정보나 해석 추가 금지

원문:
${content}

위 내용의 형식만 깔끔하게 수정해서 마크다운으로 출력해주세요.`
						}
					],
					max_tokens: 4000,
					temperature: 0.1
				})
			});

			if (response.status === 200 && response.json?.choices?.[0]?.message?.content) {
				let content = response.json.choices[0].message.content.trim();
				
				// Remove markdown code block wrappers if present
				if (content.startsWith('```markdown\n') && content.endsWith('\n```')) {
					content = content.substring(12, content.length - 4).trim();
				} else if (content.startsWith('```\n') && content.endsWith('\n```')) {
					content = content.substring(4, content.length - 4).trim();
				}
				
				return content;
			} else {
				// Enhanced error handling
				let errorMsg = `OpenAI API error: ${response.status}`;
				if (response.json?.error?.message) {
					errorMsg += ` - ${response.json.error.message}`;
				}
				throw new Error(errorMsg);
			}
			
		} catch (error) {
			console.error('OpenAI API call failed:', error);
			
			// Re-throw with more specific error types
			if (error.message.includes('401') || error.message.includes('Invalid')) {
				throw new Error('401');
			} else if (error.message.includes('quota') || error.message.includes('billing')) {
				throw new Error('quota');
			} else if (error.message.includes('network') || error.message.includes('fetch')) {
				throw new Error('network');
			} else {
				throw error;
			}
		}
	}

	convertToDirectImageUrl(url: string): string {
		// Convert Naver blog image URLs to direct download URLs - improved logic
		let directUrl = url;
		
		// For postfiles.pstatic.net, keep the original URL but without query params
		if (directUrl.includes('postfiles.pstatic.net')) {
			// Remove only size-related query parameters, keep the URL structure
			directUrl = directUrl.replace(/\?type=w\d+/i, '').replace(/&type=w\d+/i, '');
			console.log(`Postfiles URL cleaned: ${url} -> ${directUrl}`);
			return directUrl;
		}
		
		// Remove query parameters for other domains
		directUrl = directUrl.split('?')[0];
		
		// Convert various Naver CDN formats to direct download URLs
		directUrl = directUrl
			.replace('https://mblogvideo-phinf.pstatic.net/', 'https://blogfiles.pstatic.net/') // video CDN
			.replace('https://mblogthumb-phinf.pstatic.net/', 'https://blogfiles.pstatic.net/') // thumbnail CDN
			.replace('https://blogpfthumb-phinf.pstatic.net/', 'https://blogfiles.pstatic.net/') // profile thumb CDN
			.replace('/MjAxOA%3D%3D/', '/MjAxOA==/')  // URL decode some patterns
			.replace('/MjAxOQ%3D%3D/', '/MjAxOQ==/')
			.replace('/MjAyMA%3D%3D/', '/MjAyMA==/')
			.replace('/MjAyMQ%3D%3D/', '/MjAyMQ==/')
			.replace('/MjAyMg%3D%3D/', '/MjAyMg==/')
			.replace('/MjAyMw%3D%3D/', '/MjAyMw==/')
			.replace('/MjAyNA%3D%3D/', '/MjAyNA==/')
			.replace('/MjAyNQ%3D%3D/', '/MjAyNQ==/'); // 2025 added
		
		console.log(`URL conversion: ${url} -> ${directUrl}`);
		return directUrl;
	}

	shouldDownloadImage(imageUrl: string, altText: string): boolean {
		// Skip common Naver blog editor assets and animations
		const skipPatterns = [
			// Naver blog editor assets
			/se-sticker/i,
			/se-emoticon/i,
			/editor/i,
			/naverblog_pc/i,
			
			// Common animation and GIF patterns
			/\.gif$/i,
			/loading/i,
			/spinner/i,
			/animation/i,
			/thumb/i,
			
			// Profile and background images
			/profile/i,
			/defaultimg/i,
			/bg_/i,
			/background/i,
			/_bg/i,
			
			// Naver UI elements
			/icon/i,
			/logo/i,
			/button/i,
			
			// Size indicators (very small images are likely UI elements)
			/1x1/,
			/spacer/i,
			/dot\./i,
			
			// Common UI image names
			/arrow/i,
			/bullet/i,
			/divider/i
		];
		
		// Check URL patterns
		for (const pattern of skipPatterns) {
			if (pattern.test(imageUrl)) {
				console.log(`Skipping UI/animation image: ${imageUrl}`);
				return false;
			}
		}
		
		// Check alt text patterns
		if (altText) {
			const altSkipPatterns = [
				/이모티콘/i,
				/스티커/i,
				/애니메이션/i,
				/로딩/i,
				/아이콘/i,
				/profile/i,
				/background/i,
				/프로필/i,
				/배경/i
			];
			
			for (const pattern of altSkipPatterns) {
				if (pattern.test(altText)) {
					console.log(`Skipping image by alt text: ${altText}`);
					return false;
				}
			}
		}
		
		// Check if URL looks like a thumbnail (contains size parameters)
		const thumbnailPattern = /[?&](w|h|width|height)=\d+/i;
		if (thumbnailPattern.test(imageUrl)) {
			console.log(`Skipping thumbnail image: ${imageUrl}`);
			return false;
		}
		
		// Skip ssl.pstatic.net profile images specifically
		if (imageUrl.includes('ssl.pstatic.net/static/blog/profile/')) {
			console.log(`Skipping ssl.pstatic.net profile image: ${imageUrl}`);
			return false;
		}
		
		// Only download images from Naver CDN or direct image URLs
		const validDomains = [
			'blogfiles.pstatic.net',
			'postfiles.pstatic.net',
			'mblogthumb-phinf.pstatic.net',
			'blogpfthumb-phinf.pstatic.net'
		];
		
		const isValidDomain = validDomains.some(domain => imageUrl.includes(domain));
		if (!isValidDomain && !imageUrl.match(/\.(jpg|jpeg|png|webp)(\?|$)/i)) {
			console.log(`Skipping non-image URL: ${imageUrl}`);
			return false;
		}
		
		return true;
	}

	sanitizeFilename(filename: string): string {
		return filename
			.replace(/\[.*?\]/g, '') // Remove [] brackets
			.replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
			.replace(/^\s+|\s+$/g, '') // Trim spaces
			.substring(0, 100); // Limit length but keep spaces
	}

	async getExistingLogNos(): Promise<Set<string>> {
		const existingLogNos = new Set<string>();
		try {
			const files = this.app.vault.getMarkdownFiles();
			for (const file of files) {
				const content = await this.app.vault.read(file);
				const logNoMatch = content.match(/logNo: "([^"]+)"/i);
				if (logNoMatch) {
					existingLogNos.add(logNoMatch[1]);
				}
			}
		} catch (error) {
			console.error('Error reading existing logNos:', error);
		}
		return existingLogNos;
	}

	async syncSubscribedBlogs(): Promise<void> {
		if (this.settings.subscribedBlogs.length === 0) return;
		
		const syncNotice = new Notice('Syncing subscribed blogs...', 0); // Persistent notice
		let totalNewPosts = 0;
		let totalErrors = 0;
		const totalBlogs = this.settings.subscribedBlogs.length;
		
		try {
			for (let i = 0; i < this.settings.subscribedBlogs.length; i++) {
				const blogId = this.settings.subscribedBlogs[i];
				const blogProgress = `(${i + 1}/${totalBlogs})`;
				
				// Get blog-specific post count or use default
				const blogSubscription = this.settings.blogSubscriptions.find(sub => sub.blogId === blogId);
				const postCount = blogSubscription?.postCount || this.settings.subscriptionCount;
				
				try {
					new Notice(`Syncing blog ${blogProgress}: ${blogId} (${postCount} posts)`, 5000);
					const posts = await this.fetchNaverBlogPosts(blogId, postCount);
					
					let blogSuccessCount = 0;
					let blogErrorLogCount = 0;
					let blogErrorCount = 0;
					
					for (let j = 0; j < posts.length; j++) {
						const post = posts[j];
						const postProgress = `${blogProgress} post (${j + 1}/${posts.length})`;
						const isErrorPost = post.title.startsWith('[오류]');
						
						try {
							new Notice(`Creating ${postProgress}: ${post.title}`, 3000);
							await this.createMarkdownFile(post);
							
							if (isErrorPost) {
								blogErrorLogCount++;
							} else {
								blogSuccessCount++;
							}
							totalNewPosts++;
						} catch (error) {
							console.error(`Error creating file for post ${post.logNo} from ${blogId} ${postProgress}:`, error);
							blogErrorCount++;
							totalErrors++;
						}
						await new Promise(resolve => setTimeout(resolve, 500));
					}
					
					console.log(`Blog ${blogId}: ${blogSuccessCount} success, ${blogErrorLogCount} error logs, ${blogErrorCount} errors`);
				} catch (error) {
					console.error(`Error syncing blog ${blogId} ${blogProgress}:`, error);
					totalErrors++;
				}
			}
		} finally {
			// Always hide the persistent notice
			syncNotice.hide();
		}
		
		new Notice(`Sync complete: ${totalNewPosts} new posts imported, ${totalErrors} errors`);
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
		let importCancelled = false;
		const cancelNotice = new Notice("Click here to cancel import", 0);
		cancelNotice.noticeEl.addEventListener('click', () => {
			importCancelled = true;
			cancelNotice.hide();
			new Notice("Import cancelled by user", 5000);
		});

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
					console.log(`Import cancelled at ${i}/${totalPosts}`);
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
						console.log(`📝 Created error log ${progress}: ${post.title}`);
					} else {
						successCount++;
						console.log(`✓ Created file ${progress}: ${post.title}`);
					}
				} catch (error) {
					console.error(`✗ Error creating file for post ${post.logNo} ${progress}:`, error);
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
			console.error('Import error:', error);
			new Notice("Import failed. Please check the console for details.");
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class NaverBlogSubscribeModal extends Modal {
	plugin: NaverBlogPlugin;
	blogId: string = '';

	constructor(app: App, plugin: NaverBlogPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl("h2", { text: "Subscribe to Naver Blog" });

		let inputElement: HTMLInputElement;

		new Setting(contentEl)
			.setName("Blog ID")
			.setDesc("Enter the Naver Blog ID to subscribe to")
			.addText(text => {
				inputElement = text.inputEl;
				text.setPlaceholder("Blog ID")
					.setValue(this.blogId)
					.onChange(async (value) => {
						this.blogId = value;
					});
				
				text.inputEl.addEventListener('keydown', (event) => {
					if (event.key === 'Enter') {
						event.preventDefault();
						this.handleSubscribe();
					}
				});
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText("Subscribe")
				.setCta()
				.onClick(async () => {
					this.handleSubscribe();
				}));

		setTimeout(() => {
			if (inputElement) {
				inputElement.focus();
			}
		}, 100);
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
		
		// Initialize blog subscription with default count
		this.plugin.settings.blogSubscriptions.push({
			blogId: this.blogId,
			postCount: this.plugin.settings.subscriptionCount
		});
		
		await this.plugin.saveSettings();
		
		new Notice(`Subscribed to ${this.blogId}`);
		this.close();
		
		// Immediately sync the new subscription
		this.plugin.syncSubscribedBlogs();
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
			.addText(text => {
				const input = text
					.setPlaceholder('Naver Blog Posts')
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

		new Setting(containerEl)
			.setName('Enable Duplicate Check')
			.setDesc('Skip importing posts that already exist (based on logNo)')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableDuplicateCheck)
				.onChange(async (value) => {
					this.plugin.settings.enableDuplicateCheck = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Enable Image Download')
			.setDesc('Download and save images from blog posts')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableImageDownload)
				.onChange(async (value) => {
					this.plugin.settings.enableImageDownload = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide image folder setting
				}));

		if (this.plugin.settings.enableImageDownload) {
			new Setting(containerEl)
				.setName('Image Folder')
				.setDesc('Folder where downloaded images will be saved')
				.addText(text => {
					const input = text
						.setPlaceholder('Naver Blog Posts/attachments')
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

		new Setting(containerEl)
			.setName('Subscription Count')
			.setDesc('Number of recent posts to fetch for subscribed blogs')
			.addText(text => text
				.setPlaceholder('10')
				.setValue(this.plugin.settings.subscriptionCount.toString())
				.onChange(async (value) => {
					const count = parseInt(value) || 10;
					this.plugin.settings.subscriptionCount = count;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('h3', { text: 'Subscribed Blogs' });
		
		const subscriptionDiv = containerEl.createDiv();
		this.displaySubscriptions(subscriptionDiv);

		new Setting(containerEl)
			.setName('Add Blog Subscription')
			.setDesc('Add a blog ID to automatically sync new posts')
			.addText(text => {
				text.setPlaceholder('Blog ID (e.g., yonofbooks)');
				return text;
			})
			.addButton(button => button
				.setButtonText('Add')
				.onClick(async () => {
					const input = button.buttonEl.previousElementSibling as HTMLInputElement;
					const blogId = input.value.trim();
					if (blogId && !this.plugin.settings.subscribedBlogs.includes(blogId)) {
						this.plugin.settings.subscribedBlogs.push(blogId);
						
						// Initialize blog subscription with default count
						this.plugin.settings.blogSubscriptions.push({
							blogId: blogId,
							postCount: this.plugin.settings.subscriptionCount
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
			containerEl.createEl('p', { text: 'No subscribed blogs' });
			return;
		}

		this.plugin.settings.subscribedBlogs.forEach((blogId, index) => {
			const blogDiv = containerEl.createDiv();
			blogDiv.style.display = 'grid';
			blogDiv.style.gridTemplateColumns = '1fr auto auto auto';
			blogDiv.style.gap = '10px';
			blogDiv.style.alignItems = 'center';
			blogDiv.style.padding = '10px';
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
			
			const countLabel = countDiv.createEl('span', { text: 'Posts:' });
			countLabel.style.fontSize = '0.9em';
			countLabel.style.color = 'var(--text-muted)';
			
			const blogSubscription = this.plugin.settings.blogSubscriptions.find(sub => sub.blogId === blogId);
			const currentCount = blogSubscription?.postCount || this.plugin.settings.subscriptionCount;
			
			const countInput = countDiv.createEl('input', {
				type: 'number',
				value: currentCount.toString()
			});
			countInput.style.width = '60px';
			countInput.style.padding = '2px 4px';
			countInput.style.fontSize = '0.9em';
			countInput.min = '1';
			countInput.max = '100';
			
			countInput.onchange = async () => {
				const newCount = parseInt(countInput.value) || this.plugin.settings.subscriptionCount;
				
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
			const syncButton = blogDiv.createEl('button', { text: 'Sync' });
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
			const removeButton = blogDiv.createEl('button', { text: 'Remove' });
			removeButton.style.fontSize = '0.8em';
			removeButton.style.padding = '4px 8px';
			removeButton.style.backgroundColor = 'var(--interactive-accent)';
			removeButton.style.color = 'var(--text-on-accent)';
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
				top: 100%;
				left: 0;
				width: ${inputEl.offsetWidth}px;
				max-height: 200px;
				overflow-y: auto;
				background: var(--background-primary);
				border: 1px solid var(--background-modifier-border);
				border-radius: 6px;
				box-shadow: var(--shadow-s);
				z-index: 1000;
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

class FolderSuggestModal extends Modal {
	folders: string[];
	onChoose: (folder: string) => void;
	
	constructor(app: App, folders: string[], onChoose: (folder: string) => void) {
		super(app);
		this.folders = folders;
		this.onChoose = onChoose;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'Select Folder' });

		const inputEl = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Type to filter folders...'
		});
		inputEl.style.width = '100%';
		inputEl.style.marginBottom = '10px';

		const listEl = contentEl.createEl('div');
		listEl.style.maxHeight = '300px';
		listEl.style.overflowY = 'auto';

		const renderFolders = (filter: string = '') => {
			listEl.empty();
			
			const filteredFolders = this.folders.filter(folder => 
				folder.toLowerCase().includes(filter.toLowerCase())
			);

			for (const folder of filteredFolders) {
				const folderEl = listEl.createEl('div', {
					text: folder || '(Root)',
					cls: 'suggestion-item'
				});
				folderEl.style.padding = '8px';
				folderEl.style.cursor = 'pointer';
				folderEl.style.borderBottom = '1px solid var(--background-modifier-border)';
				
				folderEl.addEventListener('click', () => {
					this.onChoose(folder);
					this.close();
				});

				folderEl.addEventListener('mouseenter', () => {
					folderEl.style.backgroundColor = 'var(--background-modifier-hover)';
				});

				folderEl.addEventListener('mouseleave', () => {
					folderEl.style.backgroundColor = '';
				});
			}
		};

		inputEl.addEventListener('input', () => {
			renderFolders(inputEl.value);
		});

		// Initial render
		renderFolders();

		// Focus the input
		setTimeout(() => inputEl.focus(), 100);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class NaverBlogSinglePostModal extends Modal {
	plugin: NaverBlogPlugin;

	constructor(app: App, plugin: NaverBlogPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Import Single Naver Blog Post' });

		const inputContainer = contentEl.createDiv();
		inputContainer.style.marginBottom = '20px';

		const inputLabel = inputContainer.createEl('label', {
			text: 'Post URL or LogNo:',
			cls: 'setting-item-name'
		});
		inputLabel.style.display = 'block';
		inputLabel.style.marginBottom = '8px';

		const input = inputContainer.createEl('input', {
			type: 'text',
			placeholder: 'https://blog.naver.com/blogid/220883239733 or https://m.blog.naver.com/PostView.naver?blogId=blogid&logNo=220883239733 or just 220883239733'
		});
		input.style.width = '100%';
		input.style.padding = '8px';
		input.style.border = '1px solid var(--background-modifier-border)';
		input.style.borderRadius = '4px';

		const exampleDiv = inputContainer.createDiv();
		exampleDiv.style.marginTop = '8px';
		exampleDiv.style.fontSize = '0.9em';
		exampleDiv.style.color = 'var(--text-muted)';
		exampleDiv.innerHTML = `
			<strong>Examples:</strong><br>
			• Desktop URL: https://blog.naver.com/yonofbooks/220883239733<br>
			• Mobile URL: https://m.blog.naver.com/PostView.naver?blogId=xk2a1&logNo=223926972265<br>
			• LogNo only: 220883239733
		`;

		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '10px';
		buttonContainer.style.justifyContent = 'flex-end';

		const cancelButton = buttonContainer.createEl('button', {
			text: 'Cancel'
		});
		cancelButton.addEventListener('click', () => this.close());

		const importButton = buttonContainer.createEl('button', {
			text: 'Import Post',
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
				
				console.log('Single post import result:', post);
				
				// Create the file
				await this.plugin.createMarkdownFile({
					...post,
					tags: ['imported'],
					excerpt: post.content.substring(0, 150) + '...'
				});
				
				new Notice(`✓ Successfully imported: "${post.title}"`, 5000);
			} catch (error) {
				console.error('Single post import failed:', error);
				new Notice(`✗ Failed to import post: ${error.message}`, 5000);
			}
		});

		// Enter key to import
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				importButton.click();
			}
		});

		// Focus the input
		setTimeout(() => input.focus(), 100);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}