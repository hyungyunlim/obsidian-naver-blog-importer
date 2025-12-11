import { App, requestUrl, normalizePath, Notice } from 'obsidian';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { Element, AnyNode } from 'domhandler';
import type { NewsArticle, NewsImage, NewsComment, NaverNewsSettings } from '../types';
import {
	NAVER_NEWS_SELECTORS,
	NAVER_NEWS_URL_PATTERNS,
	NAVER_NEWS_IMAGE_DOMAIN,
	NAVER_NEWS_COMMENT_API,
	NAVER_NEWS_COMMENT_PARAMS,
} from '../constants';

export class NaverNewsFetcher {
	constructor(
		private app: App,
		private settings: NaverNewsSettings
	) {}

	/**
	 * Parse news URL to extract oid and aid
	 */
	parseNewsUrl(url: string): { oid: string; aid: string } | null {
		// Try short URL pattern: https://n.news.naver.com/article/{oid}/{aid}
		let match = url.match(NAVER_NEWS_URL_PATTERNS.shortUrl);
		if (match) {
			return { oid: match[1], aid: match[2] };
		}

		// Try mnews URL pattern: https://n.news.naver.com/mnews/article/{oid}/{aid}
		match = url.match(NAVER_NEWS_URL_PATTERNS.mnewsUrl);
		if (match) {
			return { oid: match[1], aid: match[2] };
		}

		// Try mobile URL pattern: https://m.news.naver.com/article/{oid}/{aid}
		match = url.match(NAVER_NEWS_URL_PATTERNS.mobileUrl);
		if (match) {
			return { oid: match[1], aid: match[2] };
		}

		// Try long URL pattern with query params
		match = url.match(NAVER_NEWS_URL_PATTERNS.longUrl);
		if (match) {
			// Pattern can match in either order (oid first or aid first)
			const oid = match[1] || match[4];
			const aid = match[2] || match[3];
			if (oid && aid) {
				return { oid, aid };
			}
		}

		return null;
	}

	/**
	 * Fetch article from Naver News
	 */
	async fetchArticle(url: string): Promise<NewsArticle> {
		const parsed = this.parseNewsUrl(url);
		if (!parsed) {
			throw new Error('Invalid Naver News URL');
		}

		const { oid, aid } = parsed;
		const articleUrl = `https://n.news.naver.com/article/${oid}/${aid}`;

		try {
			const response = await requestUrl({
				url: articleUrl,
				method: 'GET',
				headers: {
					'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
					'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
					'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
				},
			});

			if (response.status !== 200) {
				throw new Error(`Failed to fetch article: HTTP ${response.status}`);
			}

			const article = this.parseArticleHtml(response.text, oid, aid, articleUrl);

			// Fetch comments if enabled
			if (this.settings.includeNewsComments) {
				try {
					article.comments = await this.fetchComments(oid, aid);
				} catch {
					article.comments = [];
				}
			}

			return article;
		} catch (error) {
			throw new Error(`Failed to fetch article: ${error.message}`);
		}
	}

	/**
	 * Parse article HTML and extract data
	 */
	private parseArticleHtml(html: string, oid: string, aid: string, url: string): NewsArticle {
		const $ = cheerio.load(html);

		// Extract title
		const title = this.extractTitle($);

		// Extract press info
		const press = this.extractPress($);

		// Extract journalists
		const journalists = this.extractJournalists($);

		// Extract dates
		const { publishedAt, modifiedAt } = this.extractDates($);

		// Extract category
		const category = $(NAVER_NEWS_SELECTORS.category).first().text().trim() || undefined;

		// Extract original URL
		const originalUrl = this.settings.includeOriginalUrl
			? $(NAVER_NEWS_SELECTORS.originalUrl).attr('href') || undefined
			: undefined;

		// Extract content with images in order
		const { content, images } = this.extractContentWithImages($);

		// Extract comment count
		const commentCountText = $(NAVER_NEWS_SELECTORS.commentCount).text().replace(/[^0-9]/g, '');
		const commentCount = parseInt(commentCountText) || 0;

		return {
			title,
			content,
			press,
			pressId: oid,
			articleId: aid,
			journalists,
			publishedAt,
			modifiedAt,
			category,
			originalUrl,
			url,
			images,
			commentCount,
		};
	}

	/**
	 * Extract title from article
	 */
	private extractTitle($: CheerioAPI): string {
		const titleSelectors = NAVER_NEWS_SELECTORS.title.split(', ');
		for (const selector of titleSelectors) {
			const el = $(selector);
			if (el.length > 0) {
				const title = el.text().trim();
				if (title) return title;
			}
		}
		return 'Untitled Article';
	}

	/**
	 * Extract press name from article
	 */
	private extractPress($: CheerioAPI): string {
		const pressEl = $(NAVER_NEWS_SELECTORS.press);
		if (pressEl.length > 0) {
			// Try alt attribute first (for logo image)
			const alt = pressEl.attr('alt');
			if (alt) return alt.trim();
			// Fallback to text content
			const text = pressEl.text().trim();
			if (text) return text;
		}
		return 'Unknown Press';
	}

	/**
	 * Extract journalists from article
	 */
	private extractJournalists($: CheerioAPI): string[] {
		const journalists: string[] = [];
		$(NAVER_NEWS_SELECTORS.journalists).each((_, el) => {
			const name = $(el).text().trim();
			if (name && !journalists.includes(name)) {
				journalists.push(name);
			}
		});
		return journalists;
	}

	/**
	 * Extract published and modified dates
	 */
	private extractDates($: CheerioAPI): { publishedAt: string; modifiedAt?: string } {
		let publishedAt = new Date().toISOString();
		let modifiedAt: string | undefined;

		// Extract published date
		const publishedEl = $(NAVER_NEWS_SELECTORS.publishedAt);
		if (publishedEl.length > 0) {
			const dateTime = publishedEl.attr('data-date-time');
			if (dateTime) {
				publishedAt = this.formatDateTime(dateTime);
			}
		}

		// Extract modified date
		const modifiedEl = $(NAVER_NEWS_SELECTORS.modifiedAt);
		if (modifiedEl.length > 0) {
			const dateTime = modifiedEl.attr('data-modify-date-time');
			if (dateTime) {
				modifiedAt = this.formatDateTime(dateTime);
			}
		}

		return { publishedAt, modifiedAt };
	}

	/**
	 * Format date-time string to ISO format
	 */
	private formatDateTime(dateTime: string): string {
		try {
			// dateTime format: "2025-12-10 09:43:11"
			const date = new Date(dateTime.replace(' ', 'T') + '+09:00');
			return date.toISOString();
		} catch {
			return new Date().toISOString();
		}
	}

	/**
	 * Extract content with images preserving order
	 * This is the key function for maintaining image-text order
	 */
	private extractContentWithImages($: CheerioAPI): { content: string; images: NewsImage[] } {
		const articleEl = $(NAVER_NEWS_SELECTORS.content);
		if (articleEl.length === 0) {
			return { content: '', images: [] };
		}

		let markdown = '';
		const images: NewsImage[] = [];
		let imageCount = 0;

		// Process all child nodes in DOM order
		const processNode = (node: AnyNode) => {
			if (node.type === 'text') {
				const text = (node as unknown as { data: string }).data?.trim();
				if (text) {
					markdown += text + '\n\n';
				}
			} else if (node.type === 'tag') {
				const element = node as Element;
				const $el = $(element);
				const tagName = element.tagName.toLowerCase();

				// Image container
				if ($el.hasClass('end_photo_org') || $el.hasClass('nbd_im_w')) {
					const img = $el.find('img');
					const caption = $el.find(NAVER_NEWS_SELECTORS.imageCaptions);

					if (img.length > 0) {
						const src = img.attr('data-src') || img.attr('src') || '';
						const alt = caption.text().trim() || img.attr('alt') || '';

						if (src && this.isValidImageUrl(src)) {
							imageCount++;
							const imageInfo: NewsImage = {
								src: this.convertToHighResUrl(src),
								alt,
								caption: caption.text().trim() || undefined,
							};
							images.push(imageInfo);

							// Add image to markdown
							markdown += `![${alt}](${imageInfo.src})\n`;
							if (imageInfo.caption) {
								markdown += `*${imageInfo.caption}*\n`;
							}
							markdown += '\n';
						}
					}
				}
				// Paragraph
				else if (tagName === 'p' || tagName === 'div') {
					// Check if this element contains an image container
					const hasImageContainer = $el.find('.end_photo_org, .nbd_im_w').length > 0;

					if (hasImageContainer) {
						// Process children to handle image containers
						$el.children().each((_, child) => {
							processNode(child);
						});
					} else {
						const text = $el.text().trim();
						// Skip empty text, zero-width spaces, and reporter info patterns
						if (text && text !== '​' && !this.isReporterInfo(text)) {
							markdown += text + '\n\n';
						}
					}
				}
				// Span (often wraps text)
				else if (tagName === 'span') {
					const text = $el.text().trim();
					if (text && text !== '​' && !this.isReporterInfo(text)) {
						markdown += text + '\n\n';
					}
				}
				// Break
				else if (tagName === 'br') {
					markdown += '\n';
				}
				// Strong/Bold
				else if (tagName === 'strong' || tagName === 'b') {
					const text = $el.text().trim();
					if (text) {
						markdown += `**${text}**`;
					}
				}
				// Emphasis/Italic
				else if (tagName === 'em' || tagName === 'i') {
					// Skip image captions (handled separately)
					if (!$el.hasClass('img_desc')) {
						const text = $el.text().trim();
						if (text) {
							markdown += `*${text}*`;
						}
					}
				}
				// Links
				else if (tagName === 'a') {
					const href = $el.attr('href');
					const text = $el.text().trim();
					if (href && text) {
						markdown += `[${text}](${href})`;
					}
				}
				// Table
				else if (tagName === 'table') {
					markdown += this.parseTable($el, $);
				}
				// Other elements - recursively process children
				else {
					$el.children().each((_, child) => {
						processNode(child);
					});
				}
			}
		};

		// Process article content
		articleEl.contents().each((_, node) => {
			processNode(node);
		});

		// Clean up markdown
		const cleanedContent = this.cleanContent(markdown);

		return { content: cleanedContent, images };
	}

	/**
	 * Check if text is reporter info (to be skipped)
	 */
	private isReporterInfo(text: string): boolean {
		// Common patterns for reporter info at the end of articles
		const patterns = [
			/^[\w\s]+\s*기자$/,
			/^[\w\s]+\s*특파원$/,
			/^\w+@\w+\.\w+$/,
			/^▶/,
			/^※/,
		];
		return patterns.some(pattern => pattern.test(text));
	}

	/**
	 * Parse HTML table to markdown
	 * Handles both regular tables and image tables
	 */
	private parseTable($table: ReturnType<CheerioAPI>, $: CheerioAPI): string {
		// First, check if this table contains an image
		const img = $table.find('img');
		if (img.length > 0) {
			// This is an image table - extract image and caption
			const src = img.attr('data-src') || img.attr('src') || '';

			if (src && this.isValidImageUrl(src)) {
				const highResSrc = this.convertToHighResUrl(src);

				// Find caption from table text (excluding empty cells)
				const captions: string[] = [];
				$table.find('td, th').each((_, cell) => {
					const text = $(cell).text().trim();
					if (text && !$(cell).find('img').length) {
						captions.push(text);
					}
				});

				const alt = captions.join(' ').trim() || img.attr('alt') || '';
				let markdown = `![${alt}](${highResSrc})\n`;
				if (captions.length > 0) {
					markdown += `*${captions.join(' ')}*\n`;
				}
				return markdown + '\n';
			}
		}

		// Regular table without images
		let tableMarkdown = '\n';

		$table.find('tr').each((rowIdx, row) => {
			const cells: string[] = [];
			$(row).find('td, th').each((_, cell) => {
				cells.push($(cell).text().trim());
			});

			if (cells.length > 0) {
				tableMarkdown += '| ' + cells.join(' | ') + ' |\n';
				// Add header separator after first row
				if (rowIdx === 0) {
					tableMarkdown += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
				}
			}
		});

		return tableMarkdown + '\n';
	}

	/**
	 * Check if URL is a valid content image
	 */
	private isValidImageUrl(src: string): boolean {
		if (!src || !src.startsWith('http')) return false;

		const skipPatterns = [
			/icon/i,
			/logo/i,
			/button/i,
			/profile/i,
			/emoticon/i,
			/sticker/i,
			/1x1/,
			/spacer/i,
			/loading/i,
			/spinner/i,
			/blank/i,
		];

		for (const pattern of skipPatterns) {
			if (pattern.test(src)) return false;
		}

		return true;
	}

	/**
	 * Convert image URL to high resolution
	 */
	private convertToHighResUrl(url: string): string {
		// For imgnews.pstatic.net, convert to high resolution
		if (url.includes(NAVER_NEWS_IMAGE_DOMAIN)) {
			if (url.includes('type=')) {
				return url.replace(/type=w\d+/gi, 'type=w2000');
			} else {
				return url + (url.includes('?') ? '&' : '?') + 'type=w2000';
			}
		}
		return url;
	}

	/**
	 * Clean up content
	 */
	private cleanContent(content: string): string {
		return content
			.replace(/\r\n/g, '\n')
			.replace(/\n{3,}/g, '\n\n')
			.replace(/[ \t]+$/gm, '')
			.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '')
			.replace(/\uFFFD/g, '')
			.trim();
	}

	/**
	 * Fetch comments for an article
	 */
	async fetchComments(oid: string, aid: string): Promise<NewsComment[]> {
		const allComments: NewsComment[] = [];
		let page = 1;
		const maxPages = 5; // Safety limit

		while (page <= maxPages) {
			try {
				const url = `${NAVER_NEWS_COMMENT_API}?ticket=${NAVER_NEWS_COMMENT_PARAMS.ticket}&objectId=news${oid},${aid}&pageSize=${NAVER_NEWS_COMMENT_PARAMS.pageSize}&page=${page}`;

				const response = await requestUrl({
					url,
					method: 'GET',
					headers: {
						'Accept': 'application/json',
						'Referer': `https://n.news.naver.com/article/${oid}/${aid}`,
					},
				});

				if (response.status !== 200) break;

				// Parse JSONP response
				const jsonpMatch = response.text.match(/\((\{[\s\S]*\})\)/);
				if (!jsonpMatch) break;

				const data = JSON.parse(jsonpMatch[1]);
				const result = data.result;

				if (!result || !result.commentList) break;

				const comments = this.parseComments(result.commentList);
				if (comments.length === 0) break;

				allComments.push(...comments);

				// Check for more pages
				if (!result.pageModel || page >= result.pageModel.totalPages) {
					break;
				}

				page++;
				await this.delay(300);
			} catch {
				break;
			}
		}

		return allComments;
	}

	/**
	 * Parse comments from API response
	 */
	private parseComments(commentList: unknown[]): NewsComment[] {
		const comments: NewsComment[] = [];

		for (const item of commentList) {
			const comment = item as Record<string, unknown>;

			const author = (comment.userName as string) || (comment.maskedUserId as string) || 'Anonymous';
			const content = (comment.contents as string) || '';
			const date = (comment.modTime as string) || (comment.regTime as string) || '';
			const likes = (comment.sympathyCount as number) || 0;
			const dislikes = (comment.antipathyCount as number) || 0;

			if (content.trim()) {
				comments.push({
					author,
					content: content.trim(),
					date,
					likes,
					dislikes,
				});
			}
		}

		return comments;
	}

	/**
	 * Convert article to markdown with frontmatter
	 */
	convertToMarkdown(article: NewsArticle): string {
		let markdown = '---\n';

		// Frontmatter
		markdown += `title: "${this.escapeYamlString(article.title)}"\n`;
		markdown += `source: naver-news\n`;
		markdown += `press: ${article.press}\n`;
		markdown += `press_id: "${article.pressId}"\n`;
		markdown += `article_id: "${article.articleId}"\n`;
		markdown += `url: ${article.url}\n`;

		if (article.originalUrl) {
			markdown += `original_url: ${article.originalUrl}\n`;
		}

		if (article.journalists.length > 0) {
			markdown += `journalists:\n`;
			for (const journalist of article.journalists) {
				markdown += `  - ${journalist}\n`;
			}
		}

		if (article.category) {
			markdown += `category: ${article.category}\n`;
		}

		markdown += `published: ${article.publishedAt}\n`;

		if (article.modifiedAt) {
			markdown += `modified: ${article.modifiedAt}\n`;
		}

		if (article.commentCount !== undefined) {
			markdown += `comments: ${article.commentCount}\n`;
		}

		markdown += `imported: ${new Date().toISOString()}\n`;
		markdown += `tags: []\n`;
		markdown += '---\n\n';

		// Content
		markdown += article.content;

		// Comments
		if (article.comments && article.comments.length > 0) {
			markdown += '\n\n---\n\n## Comments\n\n';
			for (const comment of article.comments) {
				markdown += `**${comment.author}** (${comment.date})\n`;
				markdown += `${comment.content}\n`;
				markdown += `👍 ${comment.likes} 👎 ${comment.dislikes}\n\n`;
			}
		}

		return markdown;
	}

	/**
	 * Escape special characters for YAML string
	 */
	private escapeYamlString(str: string): string {
		return str
			.replace(/\\/g, '\\\\')
			.replace(/"/g, '\\"')
			.replace(/\n/g, ' ');
	}

	/**
	 * Save article to vault
	 */
	async saveArticle(article: NewsArticle): Promise<string> {
		// Determine folder path
		let folderPath = normalizePath(this.settings.newsFolder);
		if (this.settings.organizeByPress) {
			folderPath = normalizePath(`${this.settings.newsFolder}/${this.sanitizeFilename(article.press)}`);
		}

		// Create folder if it doesn't exist
		const folderExists = this.app.vault.getAbstractFileByPath(folderPath);
		if (!folderExists) {
			await this.app.vault.createFolder(folderPath);
		}

		// Download images if enabled
		let processedContent = article.content;
		if (this.settings.downloadNewsImages) {
			processedContent = await this.downloadAndReplaceImages(
				article.content,
				folderPath,
				article.articleId
			);
		}

		// Generate markdown with processed content
		const markdown = this.convertToMarkdownWithContent(article, processedContent);

		// Generate filename
		const dateStr = article.publishedAt.split('T')[0];
		const safeTitle = this.sanitizeFilename(article.title);
		const filename = `${dateStr}_${safeTitle}.md`;
		const filePath = normalizePath(`${folderPath}/${filename}`);

		// Check if file exists
		const existingFile = this.app.vault.getAbstractFileByPath(filePath);
		if (existingFile) {
			// File exists, add unique suffix
			const uniqueFilename = `${dateStr}_${safeTitle}_${article.articleId}.md`;
			const uniqueFilePath = normalizePath(`${folderPath}/${uniqueFilename}`);
			await this.app.vault.create(uniqueFilePath, markdown);
			return uniqueFilePath;
		}

		await this.app.vault.create(filePath, markdown);
		return filePath;
	}

	/**
	 * Download images and replace URLs in content
	 */
	private async downloadAndReplaceImages(
		content: string,
		folderPath: string,
		articleId: string
	): Promise<string> {
		// Create attachments folder
		const attachmentFolder = normalizePath(`${folderPath}/${this.settings.newsImageFolder}`);
		const attachmentFolderExists = this.app.vault.getAbstractFileByPath(attachmentFolder);
		if (!attachmentFolderExists) {
			await this.app.vault.createFolder(attachmentFolder);
		}

		// Find all image URLs in content
		const imageRegex = /!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g;
		let match;
		const replacements: { original: string; replacement: string }[] = [];
		let imageIndex = 0;

		while ((match = imageRegex.exec(content)) !== null) {
			const [fullMatch, altText, imageUrl] = match;

			// Only process imgnews.pstatic.net images
			if (!imageUrl.includes('imgnews.pstatic.net')) {
				continue;
			}

			try {
				// Download image
				const response = await requestUrl({
					url: imageUrl,
					method: 'GET',
				});

				if (response.status === 200) {
					// Determine file extension
					const contentType = response.headers['content-type'] || '';
					let ext = '.jpg';
					if (contentType.includes('png')) ext = '.png';
					else if (contentType.includes('gif')) ext = '.gif';
					else if (contentType.includes('webp')) ext = '.webp';

					// Generate filename
					imageIndex++;
					const imageFilename = `${articleId}_${imageIndex}${ext}`;
					const imagePath = normalizePath(`${attachmentFolder}/${imageFilename}`);

					// Save image
					await this.app.vault.createBinary(imagePath, response.arrayBuffer);

					// Create relative path for markdown
					const relativePath = `${this.settings.newsImageFolder}/${imageFilename}`;
					replacements.push({
						original: fullMatch,
						replacement: `![${altText}](${relativePath})`
					});
				}
			} catch (error) {
				// Skip failed images, keep original URL
				new Notice(`Failed to download image: ${error.message}`);
			}

			// Small delay between downloads
			await this.delay(100);
		}

		// Replace all image URLs
		let processedContent = content;
		for (const { original, replacement } of replacements) {
			processedContent = processedContent.replace(original, replacement);
		}

		return processedContent;
	}

	/**
	 * Convert article to markdown with custom content
	 */
	private convertToMarkdownWithContent(article: NewsArticle, content: string): string {
		let markdown = '---\n';

		// Frontmatter
		markdown += `title: "${this.escapeYamlString(article.title)}"\n`;
		markdown += `source: naver-news\n`;
		markdown += `press: ${article.press}\n`;
		markdown += `press_id: "${article.pressId}"\n`;
		markdown += `article_id: "${article.articleId}"\n`;
		markdown += `url: ${article.url}\n`;

		if (article.originalUrl) {
			markdown += `original_url: ${article.originalUrl}\n`;
		}

		if (article.journalists.length > 0) {
			markdown += `journalists:\n`;
			for (const journalist of article.journalists) {
				markdown += `  - ${journalist}\n`;
			}
		}

		if (article.category) {
			markdown += `category: ${article.category}\n`;
		}

		markdown += `published: ${article.publishedAt}\n`;

		if (article.modifiedAt) {
			markdown += `modified: ${article.modifiedAt}\n`;
		}

		if (article.commentCount !== undefined) {
			markdown += `comments: ${article.commentCount}\n`;
		}

		markdown += `imported: ${new Date().toISOString()}\n`;
		markdown += `tags: []\n`;
		markdown += '---\n\n';

		// Content (with processed images)
		markdown += content;

		// Comments
		if (article.comments && article.comments.length > 0) {
			markdown += '\n\n---\n\n## Comments\n\n';
			for (const comment of article.comments) {
				markdown += `**${comment.author}** (${comment.date})\n`;
				markdown += `${comment.content}\n`;
				markdown += `👍 ${comment.likes} 👎 ${comment.dislikes}\n\n`;
			}
		}

		return markdown;
	}

	/**
	 * Sanitize filename
	 */
	private sanitizeFilename(name: string): string {
		return name
			.replace(/[<>:"/\\|?*]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
			.substring(0, 100);
	}

	/**
	 * Delay helper
	 */
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Update settings
	 */
	updateSettings(newSettings: NaverNewsSettings): void {
		this.settings = newSettings;
	}
}
