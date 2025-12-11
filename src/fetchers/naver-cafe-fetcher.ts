import { requestUrl } from 'obsidian';
import * as cheerio from 'cheerio';
import type { CheerioAPI, Cheerio } from 'cheerio';
import type { Element, AnyNode } from 'domhandler';
import type { CafeArticle, CafeArticleDetail, CafeComment } from '../types';
import {
	buildCafeArticleReadUrl,
	buildCafeArticleListUrl,
	buildCafeArticleDirectUrl,
	buildCafeMobileArticleUrl,
	buildCafeCommentListUrl,
	parseCafeUrl,
	CAFE_BASE_URL,
} from '../constants';

// Naver Cafe Article API endpoint
const CAFE_ARTICLE_API = 'https://apis.naver.com/cafe-web/cafe-articleapi/v2.1/cafes';

export class NaverCafeFetcher {
	private cafeId: string;
	private cafeUrl: string;
	private cookie: string;
	private resolvedCafeId: string | null = null;

	constructor(cafeIdOrUrl: string, cookie = '') {
		// cafeIdOrUrl can be either numeric cafeId or string cafeUrl
		this.cafeId = cafeIdOrUrl;
		this.cafeUrl = cafeIdOrUrl;
		// Clean cookie: remove newlines, carriage returns, and other control characters
		this.cookie = cookie
			.replace(/[\r\n\t]/g, '')  // Remove newlines and tabs
			.replace(/\s+/g, ' ')       // Normalize spaces
			.trim();
	}

	/**
	 * Resolve cafeUrl to numeric cafeId by fetching cafe page
	 */
	private async resolveCafeId(): Promise<string> {
		if (this.resolvedCafeId) {
			return this.resolvedCafeId;
		}

		// If already numeric, use it directly
		if (/^\d+$/.test(this.cafeId)) {
			this.resolvedCafeId = this.cafeId;
			return this.cafeId;
		}

		// Fetch cafe page to get clubId
		try {
			const response = await requestUrl({
				url: `${CAFE_BASE_URL}/${this.cafeUrl}`,
				method: 'GET',
				headers: this.getHeaders(),
			});

			if (response.status === 200) {
				// Extract g_sClubId from script
				const match = response.text.match(/g_sClubId\s*=\s*["']?(\d+)["']?/);
				if (match) {
					this.resolvedCafeId = match[1];
					return match[1];
				}
			}
		} catch {
			// Fall through
		}

		throw new Error(`Could not resolve cafeId for ${this.cafeUrl}`);
	}

	/**
	 * Make HTTPS request with Cookie header support
	 * Uses Obsidian's requestUrl which works on both desktop and mobile
	 */
	private async makeRequest(url: string, cookie?: string): Promise<{ status: number; body: string }> {
		const headers: Record<string, string> = {
			'Accept': 'application/json, text/plain, */*',
			'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
			'Referer': 'https://cafe.naver.com/',
			'Origin': 'https://cafe.naver.com',
			'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
		};

		if (cookie) {
			headers['Cookie'] = cookie;
		}

		try {
			const response = await requestUrl({
				url,
				method: 'GET',
				headers,
				throw: false, // Don't throw on 4xx/5xx, we handle it ourselves
			});
			return { status: response.status, body: response.text };
		} catch {
			// requestUrl failed, return error status
			return { status: 0, body: '' };
		}
	}

	/**
	 * Fetch a single article by articleId
	 */
	async fetchSingleArticle(articleId: string, includeComments = true): Promise<CafeArticleDetail> {
		try {
			// First, resolve the cafeId
			const cafeId = await this.resolveCafeId();

			// Try the article API first with native https (best method for cookie support)
			try {
				const apiUrl = `${CAFE_ARTICLE_API}/${cafeId}/articles/${articleId}`;
				const response = await this.makeRequest(apiUrl, this.cookie || undefined);

				// Check for authentication errors
				if (response.status === 401 || response.status === 403) {
					throw new Error('COOKIE_REQUIRED');
				}

				if (response.status === 200) {
					let jsonData;
					try {
						jsonData = JSON.parse(response.body);
					} catch {
						// Not valid JSON
					}
					if (jsonData) {
						// Check for error response in JSON (Naver sometimes returns 200 with error in body)
						const result = (jsonData as Record<string, unknown>).result as Record<string, unknown> | undefined;
						if (result?.errorCode === 'UNAUTHORIZED' || result?.errorCode === 'NOT_LOGGED_IN') {
							throw new Error('COOKIE_REQUIRED');
						}
						const article = this.parseArticleFromApiJson(jsonData, articleId, cafeId);

						// Fetch comments if requested
						if (includeComments) {
							try {
								article.comments = await this.fetchComments(cafeId, articleId);
							} catch {
								// Comments fetch failed, continue without comments
								article.comments = [];
							}
						}

						return article;
					}
				}
			} catch (error) {
				// Re-throw cookie errors, otherwise fall through to other methods
				if (error.message === 'COOKIE_REQUIRED') {
					throw new Error('네이버 카페 글을 가져오려면 쿠키 설정이 필요합니다. 설정에서 네이버 쿠키를 입력해주세요.');
				}
				// Fall through to other methods
			}

			// Fallback: Try HTML parsing methods
			const urlFormats = [
				`${CAFE_BASE_URL}/${this.cafeUrl}/${articleId}`,
				buildCafeArticleReadUrl(cafeId, articleId),
				buildCafeMobileArticleUrl(cafeId, articleId),
			];

			for (const url of urlFormats) {
				try {
					const response = await requestUrl({
						url,
						method: 'GET',
						headers: this.getHeaders(),
					});

					if (response.status === 200) {
						if (response.headers['content-type']?.includes('application/json')) {
							const article = this.parseArticleFromJson(response.json, articleId);
							// Try to fetch comments for HTML parsed articles too
							if (includeComments) {
								try {
									article.comments = await this.fetchComments(cafeId, articleId);
								} catch {
									article.comments = [];
								}
							}
							return article;
						}
						const article = this.parseArticleFromHtml(response.text, articleId);
						if (article.content && article.content.trim().length > 0) {
							// Try to fetch comments for HTML parsed articles too
							if (includeComments) {
								try {
									article.comments = await this.fetchComments(cafeId, articleId);
								} catch {
									article.comments = [];
								}
							}
							return article;
						}
					}
				} catch {
					continue;
				}
			}

			throw new Error(`Failed to fetch article ${articleId} from cafe ${this.cafeUrl}`);
		} catch (error) {
			throw new Error(`Failed to fetch article: ${error.message}`);
		}
	}

	/**
	 * Fetch comments for an article
	 */
	async fetchComments(cafeId: string, articleId: string): Promise<CafeComment[]> {
		const allComments: CafeComment[] = [];
		let page = 1;
		let hasMore = true;
		const maxPages = 10; // Safety limit

		while (hasMore && page <= maxPages) {
			try {
				const url = buildCafeCommentListUrl(cafeId, articleId, page);
				const response = await this.makeRequest(url, this.cookie || undefined);

				if (response.status !== 200) {
					break;
				}

				let jsonData;
				try {
					jsonData = JSON.parse(response.body);
				} catch {
					break;
				}

				const comments = this.parseCommentsFromApiJson(jsonData);
				if (comments.length === 0) {
					hasMore = false;
				} else {
					allComments.push(...comments);
					page++;
				}

				// Check if there are more pages
				const result = (jsonData as Record<string, unknown>).result as Record<string, unknown> | undefined;
				const hasNextPage = result?.hasNext as boolean | undefined;
				if (hasNextPage === false) {
					hasMore = false;
				}

				// Add delay between requests
				await this.delay(300);
			} catch {
				break;
			}
		}

		return allComments;
	}

	/**
	 * Parse comments from API JSON response
	 * Handles multiple API response structures
	 */
	private parseCommentsFromApiJson(data: unknown): CafeComment[] {
		const comments: CafeComment[] = [];
		const json = data as Record<string, unknown>;
		const result = json.result as Record<string, unknown> | undefined;

		if (!result) return comments;

		// Try different response structures
		let commentList: Array<Record<string, unknown>> | undefined;

		// Structure 1: result.comments.items (array)
		const commentsObj = result.comments as Record<string, unknown> | Array<Record<string, unknown>> | undefined;
		if (commentsObj) {
			if (Array.isArray(commentsObj)) {
				// Structure 2: result.comments is directly an array
				commentList = commentsObj;
			} else if (commentsObj.items && Array.isArray(commentsObj.items)) {
				// Structure 1: result.comments.items
				commentList = commentsObj.items as Array<Record<string, unknown>>;
			}
		}

		// Structure 3: result.commentList
		if (!commentList) {
			const directList = result.commentList as Array<Record<string, unknown>> | undefined;
			if (directList && Array.isArray(directList)) {
				commentList = directList;
			}
		}

		if (!commentList || !Array.isArray(commentList)) return comments;

		for (const comment of commentList) {
			// Parse main comment
			const parsedComment = this.parseSingleComment(comment, false);
			if (parsedComment) {
				comments.push(parsedComment);
			}

			// Parse replies (nested in replyList)
			const replyList = comment.replyList as Array<Record<string, unknown>> | undefined;
			if (replyList && Array.isArray(replyList)) {
				for (const reply of replyList) {
					const parentId = typeof comment.commentId === 'string' || typeof comment.commentId === 'number'
						? String(comment.commentId)
						: '';
					const parsedReply = this.parseSingleComment(reply, true, parentId);
					if (parsedReply) {
						comments.push(parsedReply);
					}
				}
			}
		}

		return comments;
	}

	/**
	 * Parse a single comment object
	 * Handles actual Naver Cafe API response structure:
	 * - id, refId, writer, content, updateDate, memberLevel, isRef, isArticleWriter
	 */
	private parseSingleComment(
		comment: Record<string, unknown>,
		isReply: boolean,
		parentCommentId?: string
	): CafeComment | null {
		const writer = comment.writer as Record<string, unknown> | undefined;
		const image = comment.image as Record<string, unknown> | undefined;

		// Get content
		const content = (comment.content as string) || '';

		// Skip deleted comments
		if (comment.isDeleted === true) return null;
		if (!content.trim() && !image) return null;

		// Parse timestamp - Naver uses updateDate
		const writeTimestamp = (comment.updateDate as number) ||
			(comment.writeDate as number) ||
			(comment.createDate as number);
		const writeDate = writeTimestamp
			? this.formatCommentDate(new Date(writeTimestamp))
			: '';

		// Determine if reply - Naver uses isRef field or refId !== id
		const numericId = comment.id as number | undefined;
		const refId = comment.refId as number | undefined;
		const actualIsReply = isReply ||
			(comment.isRef === true) ||
			(refId !== undefined && numericId !== undefined && refId !== numericId);
		const actualParentId = parentCommentId ||
			(actualIsReply && refId ? String(refId) : undefined);

		// Get member level directly from comment
		const memberLevel = (comment.memberLevel as number) || undefined;

		// Get attachment image URL
		let attachmentImageUrl: string | undefined;
		if (image) {
			attachmentImageUrl = (image.url as string) ||
				(image.src as string) ||
				(image.imageUrl as string);
		}

		// Safely extract commentId - avoid stringifying objects
		const rawCommentId = comment.id ?? comment.commentId;
		const commentId = typeof rawCommentId === 'string' || typeof rawCommentId === 'number'
			? String(rawCommentId)
			: '';

		return {
			commentId,
			content: content.trim(),
			writerNickname: ((writer?.nick as string) || (writer?.nickname as string) || 'Unknown').trim(),
			writerId: (writer?.id as string) || (writer?.memberKey as string),
			writeDate,
			isReply: actualIsReply,
			parentCommentId: actualParentId,
			likeCount: (comment.sympathyCount as number) || (comment.likeCount as number),
			profileImageUrl: (writer?.image as string) || (writer?.profileUrl as string),
			memberLevel,
			isWriter: (comment.isArticleWriter as boolean) || (comment.articleWriter as boolean),
			attachmentImageUrl,
			mentionedNickname: undefined, // Will be extracted from content if needed
		};
	}

	/**
	 * Format comment date to readable string
	 */
	private formatCommentDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		return `${year}.${month}.${day}. ${hours}:${minutes}`;
	}

	/**
	 * Parse article from the official Naver Cafe API response
	 */
	private parseArticleFromApiJson(data: unknown, articleId: string, cafeId: string): CafeArticleDetail {
		const json = data as Record<string, unknown>;
		const result = json.result as Record<string, unknown>;
		const article = result?.article as Record<string, unknown>;

		if (!article) {
			throw new Error('Invalid API response: no article data');
		}

		const menu = article.menu as Record<string, unknown> | undefined;
		const writer = article.writer as Record<string, unknown> | undefined;
		const cafe = result?.cafe as Record<string, unknown> | undefined;

		// Parse writeDate (timestamp)
		const writeTimestamp = article.writeDate as number;
		const writeDate = writeTimestamp
			? new Date(writeTimestamp).toISOString().split('T')[0]
			: new Date().toISOString().split('T')[0];

		// Handle scraped content (blog posts shared to cafe)
		const scrap = article.scrap as Record<string, unknown> | undefined;
		const scrapContentHtml = (scrap?.contentHtml || '') as string;
		const userContentHtml = (article.contentHtml || '') as string;

		// Process contentElements - build image map for placeholders
		// Naver API uses [[[CONTENT-ELEMENT-N]]] placeholders in contentHtml
		const contentElements = (scrap?.contentElements || []) as Array<Record<string, unknown>>;
		const extractedImages: string[] = [];
		const placeholderMap = new Map<string, string>();

		if (contentElements.length > 0) {
			contentElements.forEach((element, index) => {
				const placeholder = `[[[CONTENT-ELEMENT-${index}]]]`;
				const elementType = element.type as string;
				const elementJson = element.json as Record<string, unknown> | undefined;

				if (elementType === 'IMAGE' && elementJson?.image) {
					const imageData = elementJson.image as Record<string, unknown>;
					let imageUrl = imageData.url as string;
					if (imageUrl) {
						// Convert dthumb proxy URL to direct image URL
						imageUrl = this.convertDthumbToDirectUrl(imageUrl);
						extractedImages.push(imageUrl);
						placeholderMap.set(placeholder, `![Image](${imageUrl})`);
					}
				}
			});
		}

		// Build full content: user comment + scraped content
		let fullContent = '';

		// Add user's comment/note ONLY if this is a scrap post and user added a comment
		// For regular posts (non-scrap), userContentHtml IS the main content, not a comment
		if (scrap && userContentHtml && userContentHtml.trim()) {
			const userComment = this.convertHtmlToMarkdown(userContentHtml);
			if (userComment.trim()) {
				fullContent += `> ${userComment.trim().replace(/\n/g, '\n> ')}\n\n`;
			}
		}

		// Add scrap source info if exists
		if (scrap) {
			const sourceUrl = (scrap.linkHtml as string || '').match(/href='([^']+)'/)?.[1] || '';
			const sourceTitle = (scrap.titleHtml as string || '').replace(/<[^>]+>/g, '').trim();
			if (sourceUrl) {
				fullContent += `**출처**: [${sourceTitle || sourceUrl}](${sourceUrl})\n\n---\n\n`;
			}
		}

		// Add main content (scraped or original)
		const mainContentHtml = scrapContentHtml || userContentHtml;
		let mainContent = this.convertHtmlToMarkdown(mainContentHtml);

		// Replace placeholders with actual images AFTER markdown conversion
		// The placeholders survive as text through the HTML-to-markdown conversion
		let placeholdersReplaced = 0;
		for (const [placeholder, imgMarkdown] of placeholderMap) {
			if (mainContent.includes(placeholder)) {
				mainContent = mainContent.replace(placeholder, `\n\n${imgMarkdown}\n\n`);
				placeholdersReplaced++;
			}
		}
		// Clean up any remaining placeholders
		mainContent = mainContent.replace(/\[\[\[CONTENT-ELEMENT-\d+\]\]\]/g, '');

		// Only append contentElements images if:
		// 1. No placeholders were replaced AND
		// 2. convertHtmlToMarkdown didn't extract any images (check for ![ pattern)
		// This prevents duplicate images and preserves DOM order
		const hasImagesInContent = mainContent.includes('![');
		if (placeholdersReplaced === 0 && extractedImages.length > 0 && !hasImagesInContent) {
			mainContent += '\n\n';
			for (const imageUrl of extractedImages) {
				mainContent += `![Image](${imageUrl})\n\n`;
			}
		}

		fullContent += mainContent;

		const content = fullContent.trim();
		// Use extracted images from contentElements, or fallback to HTML extraction
		const images = extractedImages.length > 0
			? extractedImages
			: this.extractImagesFromHtml(scrapContentHtml || userContentHtml);

		// Extract cafe name (prefer pcCafeName for full name, fallback to name)
		const cafeName = (cafe?.pcCafeName || cafe?.name || '') as string;

		return {
			articleId,
			title: (article.subject || `Article ${articleId}`) as string,
			writerNickname: (writer?.nick || 'Unknown') as string,
			writeDate,
			viewCount: (article.readCount || 0) as number,
			commentCount: (article.commentCount || 0) as number,
			menuId: (menu?.id || 0) as number,
			menuName: (menu?.name || '') as string,
			cafeId,
			cafeName,
			content,
			images,
			attachments: [],
			tags: [],
			url: buildCafeArticleDirectUrl(this.cafeUrl, articleId),
		};
	}

	/**
	 * Fetch article list from a menu (board)
	 */
	async fetchArticleList(menuId?: number, maxArticles = 50): Promise<CafeArticle[]> {
		const articles: CafeArticle[] = [];
		let page = 1;
		const maxPages = Math.ceil(maxArticles / 50);

		while (articles.length < maxArticles && page <= maxPages) {
			try {
				const url = buildCafeArticleListUrl(this.cafeId, menuId, page);
				const response = await requestUrl({
					url,
					method: 'GET',
					headers: this.getHeaders(),
				});

				if (response.status !== 200) break;

				const pageArticles = this.parseArticleListFromHtml(response.text);
				if (pageArticles.length === 0) break;

				for (const article of pageArticles) {
					if (!articles.find(a => a.articleId === article.articleId)) {
						articles.push(article);
					}
				}

				page++;
				await this.delay(500);
			} catch {
				break;
			}
		}

		return articles.slice(0, maxArticles);
	}

	/**
	 * Fetch multiple articles with content
	 */
	async fetchArticles(menuId?: number, maxArticles = 10): Promise<CafeArticleDetail[]> {
		const articleList = await this.fetchArticleList(menuId, maxArticles);
		const articlesWithContent: CafeArticleDetail[] = [];

		for (const article of articleList) {
			try {
				const detail = await this.fetchSingleArticle(article.articleId);
				articlesWithContent.push(detail);
				await this.delay(1000);
			} catch (error) {
				// Create error article
				articlesWithContent.push({
					...article,
					content: `[Error fetching content: ${error.message}]`,
					images: [],
					attachments: [],
					tags: [],
					url: buildCafeArticleDirectUrl(this.cafeUrl, article.articleId),
				});
			}
		}

		return articlesWithContent;
	}

	/**
	 * Parse article from HTML response
	 */
	private parseArticleFromHtml(html: string, articleId: string): CafeArticleDetail {
		const $ = cheerio.load(html);

		// Extract title
		let title = '';
		const titleSelectors = [
			'.ArticleTitle .article_title',
			'.article_header .title_text',
			'.se-title-text',
			'h3.title_text',
			'.article_title',
			'meta[property="og:title"]',
		];
		for (const selector of titleSelectors) {
			const el = $(selector);
			if (el.length > 0) {
				title = selector.startsWith('meta')
					? el.attr('content')?.trim() || ''
					: el.text().trim();
				if (title) break;
			}
		}

		// Extract date
		let writeDate = '';
		const dateSelectors = [
			'.article_info .date',
			'.WriterInfo .date',
			'.article_info_date',
			'.se_publishDate',
			'span.date',
		];
		for (const selector of dateSelectors) {
			const el = $(selector);
			if (el.length > 0) {
				writeDate = this.parseDate(el.text().trim());
				if (writeDate) break;
			}
		}

		// Extract author
		let writerNickname = '';
		const authorSelectors = [
			'.article_info .nickname',
			'.WriterInfo .nickname',
			'.nick_box .nickname',
			'a.nickname',
		];
		for (const selector of authorSelectors) {
			const el = $(selector);
			if (el.length > 0) {
				writerNickname = el.text().trim();
				if (writerNickname) break;
			}
		}

		// Extract content
		let content = '';
		const contentSelectors = [
			'.article_container .article_viewer',
			'.ContentRenderer',
			'.se-main-container',
			'.article_content',
			'#body',
		];
		for (const selector of contentSelectors) {
			const el = $(selector);
			if (el.length > 0) {
				content = this.extractContent(el, $);
				if (content.trim()) break;
			}
		}

		// Extract images
		const images: string[] = [];
		$('.article_viewer img, .se-image img, .ContentRenderer img').each((_, img) => {
			const src = $(img).attr('data-lazy-src') || $(img).attr('src');
			if (src && this.isContentImage(src)) {
				images.push(this.enhanceImageUrl(src));
			}
		});

		// Extract view count
		let viewCount = 0;
		const viewEl = $('.article_info .count, .view_count, .count');
		if (viewEl.length > 0) {
			const viewText = viewEl.text().replace(/[^0-9]/g, '');
			viewCount = parseInt(viewText) || 0;
		}

		// Extract comment count
		let commentCount = 0;
		const commentEl = $('.article_info .comment_count, .comment_count, .CommentBox .count');
		if (commentEl.length > 0) {
			const commentText = commentEl.text().replace(/[^0-9]/g, '');
			commentCount = parseInt(commentText) || 0;
		}

		// Extract cafe info
		let cafeName = '';
		// Try multiple selectors for cafe name
		const ogSiteName = $('meta[property="og:site_name"]').attr('content');
		const ogTitle = $('meta[property="og:title"]').attr('content');
		const cafeNameFromClass = $('.cafe_name, .CafeInfo .name, .cafe-info .name').first().text().trim();
		const cafeNameFromHeader = $('.cafe_name_box .cafe_name, .CafeTitle .cafe_name').first().text().trim();

		if (ogSiteName && ogSiteName !== '네이버 카페') {
			cafeName = ogSiteName;
		} else if (cafeNameFromClass) {
			cafeName = cafeNameFromClass;
		} else if (cafeNameFromHeader) {
			cafeName = cafeNameFromHeader;
		} else if (ogTitle) {
			// og:title often contains "글제목 : 카페이름" format
			const titleMatch = ogTitle.match(/:\s*(.+?)(?:\s*[-|]|$)/);
			if (titleMatch) {
				cafeName = titleMatch[1].trim();
			}
		}

		// Extract menu name
		let menuName = '';
		const menuEl = $('.article_info .board_name, .ArticleTitle .link_board');
		if (menuEl.length > 0) {
			menuName = menuEl.text().trim();
		}

		// Extract tags
		const tags: string[] = [];
		$('.tag_list .tag, .TagList a, .article_tag a').each((_, tag) => {
			let tagText = $(tag).text().trim();
			if (tagText.startsWith('#')) {
				tagText = tagText.substring(1);
			}
			if (tagText && !tags.includes(tagText)) {
				tags.push(tagText);
			}
		});

		return {
			articleId,
			title: title || `Article ${articleId}`,
			writerNickname: writerNickname || 'Unknown',
			writeDate: writeDate || new Date().toISOString().split('T')[0],
			viewCount,
			commentCount,
			menuId: 0,
			menuName,
			cafeId: this.cafeId,
			cafeName,
			content: content || '[No content could be extracted]',
			images,
			attachments: [],
			tags,
			url: buildCafeArticleDirectUrl(this.cafeUrl, articleId),
		};
	}

	/**
	 * Parse article from JSON response (mobile API)
	 */
	private parseArticleFromJson(data: unknown, articleId: string): CafeArticleDetail {
		const json = data as Record<string, unknown>;
		const result = json.result as Record<string, unknown> | undefined;
		const article = (json.article || result?.article || json) as Record<string, unknown>;

		return {
			articleId,
			title: (article.subject || article.title || `Article ${articleId}`) as string,
			writerNickname: ((article.writer as Record<string, unknown>)?.nick || article.writerNickname || 'Unknown') as string,
			writeDate: this.parseDate((article.writeDate || article.addDate || '') as string),
			viewCount: (article.readCount || article.viewCount || 0) as number,
			commentCount: (article.commentCount || 0) as number,
			menuId: (article.menuId || 0) as number,
			menuName: (article.menuName || '') as string,
			cafeId: this.cafeId,
			cafeName: ((article.cafe as Record<string, unknown>)?.name || article.cafeName || '') as string,
			content: this.convertHtmlToMarkdown((article.content || article.contentHtml || '') as string),
			images: this.extractImagesFromHtml((article.content || article.contentHtml || '') as string),
			attachments: [],
			tags: (article.tags || article.tagList || []) as string[],
			url: buildCafeArticleDirectUrl(this.cafeUrl, articleId),
		};
	}

	/**
	 * Parse article list from HTML
	 */
	private parseArticleListFromHtml(html: string): CafeArticle[] {
		const $ = cheerio.load(html);
		const articles: CafeArticle[] = [];

		// Try different list item selectors
		const listSelectors = [
			'.article-board tr',
			'.ArticleList .article_item',
			'.board_box .article_item',
			'#main-area ul.article-movie-sub li',
		];

		for (const selector of listSelectors) {
			$(selector).each((_, el) => {
				const $el = $(el);

				// Skip header row
				if ($el.hasClass('head') || $el.find('th').length > 0) return;

				// Extract article ID
				let articleId = '';
				const linkEl = $el.find('a.article, a[href*="articleid"], a.article_title');
				if (linkEl.length > 0) {
					const href = linkEl.attr('href') || '';
					const match = href.match(/articleid=(\d+)|\/(\d+)$/);
					if (match) {
						articleId = match[1] || match[2];
					}
				}
				// Also try data attribute
				if (!articleId) {
					articleId = $el.attr('data-article-id') || '';
				}

				if (!articleId) return;

				// Extract other info
				const title = $el.find('.article, .article_title, td.td_article a').text().trim();
				const nickname = $el.find('.nickname, .p-nick, td.td_name a').text().trim();
				const dateText = $el.find('.date, .td_date, td:nth-child(4)').text().trim();
				const viewText = $el.find('.view, .td_view, td:nth-child(5)').text().replace(/[^0-9]/g, '');
				const commentText = $el.find('.comment, .cmt').text().replace(/[^0-9]/g, '');

				// Check if notice or recommended
				const isNotice = $el.hasClass('notice') || $el.find('.ico_notice').length > 0;
				const isRecommended = $el.hasClass('recommended') || $el.find('.ico_recommend').length > 0;

				articles.push({
					articleId,
					title: title || `Article ${articleId}`,
					writerNickname: nickname || 'Unknown',
					writeDate: this.parseDate(dateText),
					viewCount: parseInt(viewText) || 0,
					commentCount: parseInt(commentText) || 0,
					menuId: 0,
					cafeId: this.cafeId,
					isNotice,
					isRecommended,
				});
			});

			if (articles.length > 0) break;
		}

		// Fallback: parse from script tags
		if (articles.length === 0) {
			$('script').each((_, script) => {
				const scriptContent = $(script).html();
				if (scriptContent && scriptContent.includes('articleId')) {
					const matches = scriptContent.matchAll(/articleId['":\s]+(\d+)/g);
					for (const match of matches) {
						const articleId = match[1];
						if (articleId && !articles.find(a => a.articleId === articleId)) {
							articles.push({
								articleId,
								title: `Article ${articleId}`,
								writerNickname: 'Unknown',
								writeDate: new Date().toISOString().split('T')[0],
								viewCount: 0,
								commentCount: 0,
								menuId: 0,
								cafeId: this.cafeId,
							});
						}
					}
				}
			});
		}

		return articles;
	}

	/**
	 * Extract content from element and convert to markdown
	 */
	private extractContent(element: Cheerio<AnyNode>, $: CheerioAPI): string {
		let content = '';

		// Find all se-component elements (similar to blog)
		const components = element.find('.se-component').toArray();

		if (components.length > 0) {
			components.forEach(el => {
				const $el = $(el);
				content += this.processComponent($el, $);
			});
		} else {
			// Fallback: extract text and images directly
			element.find('p, div.txt, .text').each((_, p) => {
				const text = $(p).text().trim();
				if (text) {
					content += text + '\n\n';
				}
			});

			element.find('img').each((_, img) => {
				const src = $(img).attr('data-lazy-src') || $(img).attr('src');
				if (src && this.isContentImage(src)) {
					const alt = $(img).attr('alt') || 'Image';
					content += `![${alt}](${this.enhanceImageUrl(src)})\n\n`;
				}
			});
		}

		return this.cleanContent(content);
	}

	/**
	 * Process a single se-component (reusing blog logic)
	 */
	private processComponent($el: Cheerio<Element>, $: CheerioAPI): string {
		let content = '';

		if ($el.hasClass('se-text')) {
			const textModule = $el.find('.se-module-text');
			textModule.find('p').each((_, p) => {
				const text = $(p).text().trim();
				if (text) content += text + '\n';
			});
			content += '\n';
		} else if ($el.hasClass('se-image')) {
			const img = $el.find('img');
			const src = img.attr('data-lazy-src') || img.attr('src');
			if (src && this.isContentImage(src)) {
				const caption = $el.find('.se-caption').text().trim();
				const alt = caption || img.attr('alt') || 'Image';
				content += `![${alt}](${this.enhanceImageUrl(src)})\n`;
				if (caption) content += `*${caption}*\n`;
				content += '\n';
			}
		} else if ($el.hasClass('se-quotation')) {
			const quote = $el.find('.se-quote').text().trim();
			if (quote) {
				content += `> ${quote}\n\n`;
			}
		} else if ($el.hasClass('se-code')) {
			const code = $el.find('.se-code-source').text();
			if (code) {
				content += '```\n' + code.trim() + '\n```\n\n';
			}
		} else if ($el.hasClass('se-horizontalLine')) {
			content += '---\n\n';
		} else if ($el.hasClass('se-oglink')) {
			const linkTitle = $el.find('.se-oglink-title').text().trim();
			const linkUrl = $el.find('a').attr('href');
			if (linkTitle && linkUrl) {
				content += `[${linkTitle}](${linkUrl})\n\n`;
			}
		}

		return content;
	}

	/**
	 * Convert HTML content to markdown (aligned with blog fetcher logic)
	 */
	private convertHtmlToMarkdown(html: string): string {
		const $ = cheerio.load(html);
		let content = '';

		// First, try to extract from .se-component-content structure (used in scraped posts)
		// Process all wrapper divs in DOM order to maintain text/image sequence
		const seViewer = $('.se-viewer, .se-components-wrap');
		if (seViewer.length > 0) {
			// Find all direct content wrapper divs (they have inline margin style)
			seViewer.find('div[style*="margin:30px auto"]').each((_, wrapperDiv) => {
				const $wrapper = $(wrapperDiv);

				// Check for image - try multiple selectors for different scrap post formats
				const imgEl = $wrapper.find('img.article_img, img.ATTACH_IMAGE, img[src*="postfiles"], img[src*="pstatic.net"]');
				if (imgEl.length > 0) {
					let imgSrc = imgEl.attr('src');
					if (imgSrc) {
						imgSrc = this.enhanceImageUrl(imgSrc);
						const alt = imgEl.attr('alt') || 'Image';
						content += `![${alt}](${imgSrc})\n\n`;
					}
					return; // Continue to next wrapper
				}

				// Check for horizontal line
				const hrEl = $wrapper.find('hr');
				if (hrEl.length > 0) {
					content += '---\n\n';
					return;
				}

				// Check for placeholder text (used in scrap posts for images)
				// Placeholders like [[[CONTENT-ELEMENT-0]]] are used instead of <img> tags
				const wrapperText = $wrapper.text();
				const placeholderMatch = wrapperText.match(/\[\[\[CONTENT-ELEMENT-\d+\]\]\]/);
				if (placeholderMatch) {
					content += placeholderMatch[0] + '\n\n';
					return;
				}

				// Extract text from <p> tags
				$wrapper.find('p').each((_, p) => {
					const text = $(p).text().trim();
					// Skip empty text and zero-width spaces
					if (text && text !== '​' && text.length > 0) {
						content += text + '\n\n';
					}
				});
			});

			if (content.trim()) {
				return this.cleanContent(content);
			}
		}

		// Alternative: Process .se-component-content in order
		const componentContents = $('.se-component-content');
		if (componentContents.length > 0) {
			componentContents.each((_, contentEl) => {
				const $contentEl = $(contentEl);

				// Check for image section or direct image
				const imageSection = $contentEl.find('.se-section-image');
				const directImg = $contentEl.find('img[src*="postfiles"], img[src*="pstatic.net"], img.article_img');

				if (imageSection.length > 0 || directImg.length > 0) {
					const imgEl = imageSection.length > 0 ? imageSection.find('img') : directImg;
					if (imgEl.length > 0) {
						let imgSrc = imgEl.attr('src');
						if (imgSrc) {
							imgSrc = this.enhanceImageUrl(imgSrc);
							const alt = imgEl.attr('alt') || 'Image';
							content += `![${alt}](${imgSrc})\n\n`;
						}
					}
				} else {
					// Extract text from <p> tags
					$contentEl.find('p').each((_, p) => {
						const text = $(p).text().trim();
						// Skip empty text and zero-width spaces
						if (text && text !== '​' && text.length > 0) {
							content += text + '\n\n';
						}
					});
				}
			});

			if (content.trim()) {
				return this.cleanContent(content);
			}
		}

		// Fallback: Use blog parser approach - find .se-main-container first, then .se-component
		// Also handle .se-section for scraped blog posts (they use different structure)
		const mainContainer = $('.se-main-container');
		let components;
		if (mainContainer.length > 0) {
			// Try .se-component first, then .se-section for scraped content
			components = mainContainer.find('.se-component').toArray();
			if (components.length === 0) {
				components = mainContainer.find('.se-section').toArray();
			}
		} else {
			components = $('.se-component').toArray();
			if (components.length === 0) {
				components = $('.se-section').toArray();
			}
		}

		if (components.length > 0) {
			for (const component of components) {
				const $component = $(component);

				// Text component - process all children in DOM order (p, ul, ol)
				// Also handles .se-section-text for scraped blog posts
				if ($component.hasClass('se-text') || $component.hasClass('se-section-text')) {
					const textModule = $component.find('.se-module-text');
					if (textModule.length > 0) {
						// Process all direct children in DOM order to maintain text flow
						textModule.children().each((_, child) => {
							const $child = $(child);
							const tagName = (child as Element).tagName?.toLowerCase();

							if (tagName === 'p') {
								const paragraphText = $child.text().trim();
								if (paragraphText && !paragraphText.startsWith('#')) {
									content += paragraphText + '\n';
								}
							} else if (tagName === 'ul' || tagName === 'ol') {
								const isOrdered = tagName === 'ol';
								$child.find('li').each((index, li) => {
									const listItemText = $(li).text().trim();
									if (listItemText && !listItemText.startsWith('#')) {
										if (isOrdered) {
											content += `${index + 1}. ${listItemText}\n`;
										} else {
											content += `- ${listItemText}\n`;
										}
									}
								});
								content += '\n';
							}
						});

						// Fallback: if no children processed, try to get paragraphs directly
						if (textModule.children().length === 0) {
							textModule.find('p').each((_, p) => {
								const paragraphText = $(p).text().trim();
								if (paragraphText && !paragraphText.startsWith('#')) {
									content += paragraphText + '\n';
								}
							});
						}
					} else {
						// No .se-module-text wrapper - try direct text extraction
						const directText = $component.find('p').map((_, p) => $(p).text().trim()).get().join('\n');
						if (directText) {
							content += directText + '\n';
						}
					}
					content += '\n';
				}
				// Section title
				else if ($component.hasClass('se-sectionTitle')) {
					const titleContent = $component.find('.se-module-text').text().trim();
					if (titleContent) {
						content += `## ${titleContent}\n\n`;
					}
				}
				// Quotation - improved handling like blog parser
				else if ($component.hasClass('se-quotation')) {
					const quoteElements = $component.find('.se-quote');
					const citeElement = $component.find('.se-cite');

					if (quoteElements.length > 0) {
						const quoteParts: string[] = [];
						quoteElements.each((_, quote) => {
							const quoteText = $(quote).text().trim();
							if (quoteText) {
								quoteParts.push(`> ${quoteText}`);
							}
						});

						if (quoteParts.length > 0) {
							content += '\n' + quoteParts.join('\n') + '\n';
							const citeText = citeElement.length > 0 ? citeElement.text().trim() : '';
							if (citeText) {
								content += `\n출처: ${citeText}\n\n`;
							} else {
								content += '\n';
							}
						}
					}
				}
				// Image component - with comprehensive image source detection (like blog parser)
				// Also handles .se-section-image for scraped blog posts
				else if ($component.hasClass('se-image') || $component.hasClass('se-section-image')) {
					const imgElement = $component.find('img');
					const videoElement = $component.find('video._gifmp4, video[src*="mblogvideo-phinf"]');
					const caption = $component.find('.se-caption').text().trim();

					// Check for GIF MP4 video first
					if (videoElement.length > 0) {
						const videoSrc = videoElement.attr('src') || videoElement.attr('data-gif-url');
						if (videoSrc) {
							const altText = caption || '동영상';
							content += `[${altText}](${videoSrc})\n`;
							if (caption) content += `*${caption}*\n`;
						}
					} else if (imgElement.length > 0) {
						// Try to find original image URL from data-linkdata (like blog parser)
						let imgSrc = this.extractOriginalImageUrlFromElement($component, imgElement, $);

						// Fallback to standard image source attributes
						if (!imgSrc) {
							imgSrc = imgElement.attr('data-lazy-src') ||
								imgElement.attr('src') ||
								imgElement.attr('data-src') ||
								imgElement.attr('data-original') ||
								imgElement.attr('data-image-src') ||
								imgElement.attr('data-url');
						}

						if (imgSrc && this.isContentImage(imgSrc)) {
							// enhanceImageUrl now handles dthumb conversion internally
							imgSrc = this.enhanceImageUrl(imgSrc);
							const altText = caption || imgElement.attr('alt') || 'Image';
							content += `![${altText}](${imgSrc})\n`;
							if (caption) content += `*${caption}*\n`;
						}
					} else {
						// No img element - check for placeholder text (used in scrap posts)
						// Placeholders like [[[CONTENT-ELEMENT-0]]] are in <a> tags
						const placeholderMatch = $component.text().match(/\[\[\[CONTENT-ELEMENT-\d+\]\]\]/);
						if (placeholderMatch) {
							content += placeholderMatch[0] + '\n';
						}
					}
					content += '\n';
				}
				// Image Group (slideshow/carousel) - like blog parser
				else if ($component.hasClass('se-imageGroup')) {
					const imageItems = $component.find('.se-imageGroup-item');
					const groupCaption = $component.find('.se-caption').text().trim();

					imageItems.each((_, item) => {
						const $item = $(item);
						const imgElement = $item.find('img');

						if (imgElement.length > 0) {
							let imgSrc = this.extractOriginalImageUrlFromElement($item, imgElement, $);
							if (!imgSrc) {
								imgSrc = imgElement.attr('data-lazy-src') ||
									imgElement.attr('src') ||
									imgElement.attr('data-src');
							}

							if (imgSrc && this.isContentImage(imgSrc)) {
								imgSrc = this.enhanceImageUrl(imgSrc);
								const altText = imgElement.attr('alt') || 'Image';
								content += `![${altText}](${imgSrc})\n`;
							}
						}
					});

					if (groupCaption) content += `*${groupCaption}*\n`;
					content += '\n';
				}
				// File attachment - like blog parser
				else if ($component.hasClass('se-file')) {
					const fileName = $component.find('.se-file-name').text().trim();
					const fileExt = $component.find('.se-file-extension').text().trim();
					const downloadLink = $component.find('a.se-file-save-button').attr('href');

					if (fileName && downloadLink) {
						content += `📎 [${fileName}${fileExt}](${downloadLink})\n\n`;
					} else if (fileName) {
						content += `📎 ${fileName}${fileExt}\n\n`;
					}
				}
				// OG Link preview - like blog parser
				else if ($component.hasClass('se-oglink')) {
					const linkEl = $component.find('a.se-oglink-info, a.se-oglink-thumbnail').first();
					const linkUrl = linkEl.attr('href') || $component.find('a').attr('href') || '';
					const title = $component.find('.se-oglink-title').text().trim();
					const summary = $component.find('.se-oglink-summary').text().trim();
					const domain = $component.find('.se-oglink-url').text().trim();

					if (linkUrl && title) {
						content += `> 🔗 **[${title}](${linkUrl})**\n`;
						if (summary) content += `> ${summary}\n`;
						if (domain) content += `> *${domain}*\n`;
						content += '\n';
					} else if (linkUrl) {
						content += `🔗 ${linkUrl}\n\n`;
					}
				}
				// Code component - like blog parser
				else if ($component.hasClass('se-code')) {
					const codeElements = $component.find('.se-code-source');
					if (codeElements.length > 0) {
						codeElements.each((_, code) => {
							let codeContent = $(code).text();
							if (codeContent.startsWith('\n')) codeContent = codeContent.substring(1);
							if (codeContent.endsWith('\n')) codeContent = codeContent.slice(0, -1);
							if (codeContent.trim()) {
								content += '```\n' + codeContent.trim() + '\n```\n\n';
							}
						});
					}
				}
				// Horizontal line
				else if ($component.hasClass('se-horizontalLine')) {
					content += '---\n\n';
				}
				// Material component - like blog parser
				else if ($component.hasClass('se-material')) {
					const materialElements = $component.find('a.se-module-material');
					materialElements.each((_, material) => {
						const $material = $(material);
						const linkData = $material.attr('data-linkdata');
						if (linkData) {
							try {
								const data = JSON.parse(linkData);
								const title = data.title || 'No Title';
								const link = data.link || '#';
								const type = data.type || 'Unknown';
								content += `[${title}](${link}) (${type})\n\n`;
							} catch {
								content += '[자료]\n\n';
							}
						}
					});
				}
				// Video
				else if ($component.hasClass('se-video')) {
					content += '[비디오]\n\n';
				}
				// Embedded content (YouTube, etc.)
				else if ($component.hasClass('se-oembed')) {
					const oembedContent = this.parseOembedComponent($component, $);
					content += oembedContent;
				}
				// Table
				else if ($component.hasClass('se-table')) {
					$component.find('tr').each((rowIdx, row) => {
						const cells: string[] = [];
						$(row).find('td, th').each((_, cell) => {
							cells.push($(cell).text().trim());
						});
						if (cells.length > 0) {
							content += '| ' + cells.join(' | ') + ' |\n';
							// Add header separator after first row
							if (rowIdx === 0) {
								content += '| ' + cells.map(() => '---').join(' | ') + ' |\n';
							}
						}
					});
					content += '\n';
				}
				// Map component
				else if ($component.hasClass('se-map')) {
					const mapName = $component.find('.se-map-title, .se-place-name').text().trim();
					const mapUrl = $component.find('a').attr('href');
					if (mapName) {
						content += mapUrl ? `[📍 ${mapName}](${mapUrl})\n\n` : `📍 ${mapName}\n\n`;
					}
				}
				// Sticker/emoticon - skip
				else if ($component.hasClass('se-sticker')) {
					// Skip stickers
				}
				// Fallback for unknown components
				else {
					const textContent = $component.text().trim();
					if (textContent && textContent.length > 10 && !textContent.startsWith('#')) {
						content += textContent + '\n\n';
					}
				}
			}
		}

		// Fallback: if no SE components or empty content, try basic extraction
		// Process elements in DOM order to maintain text/image sequence
		if (!content.trim()) {
			// Find all block-level elements and process them in order
			$('body').find('p, img, div[style*="margin:30px"], .se-component-content, hr').each((_, el) => {
				const $el = $(el);
				const tagName = (el as Element).tagName?.toLowerCase();

				// Skip if this element is inside another element we already processed
				if ($el.parents('.se-component-content').length > 0 && tagName !== 'p' && tagName !== 'img') {
					return;
				}

				if (tagName === 'p') {
					const text = $el.text().trim();
					if (text && text !== '​' && text.length > 0) {
						content += text + '\n\n';
					}
				} else if (tagName === 'img') {
					const src = $el.attr('data-lazy-src') || $el.attr('src');
					if (src && this.isContentImage(src)) {
						const alt = $el.attr('alt') || 'Image';
						content += `![${alt}](${this.enhanceImageUrl(src)})\n\n`;
					}
				} else if (tagName === 'hr') {
					content += '---\n\n';
				} else if (tagName === 'div') {
					// Check for image in wrapper div
					const imgEl = $el.find('img[src*="postfiles"], img[src*="pstatic.net"], img.article_img');
					if (imgEl.length > 0) {
						let imgSrc = imgEl.attr('src');
						if (imgSrc) {
							imgSrc = this.enhanceImageUrl(imgSrc);
							const alt = imgEl.attr('alt') || 'Image';
							content += `![${alt}](${imgSrc})\n\n`;
						}
					} else {
						// Extract text from wrapper div's p tags
						$el.find('p').each((_, p) => {
							const text = $(p).text().trim();
							if (text && text !== '​' && text.length > 0) {
								content += text + '\n\n';
							}
						});
					}
				}
			});
		}

		return this.cleanContent(content);
	}

	/**
	 * Extract original image URL from data-linkdata (like blog parser)
	 */
	private extractOriginalImageUrlFromElement(
		$el: Cheerio<AnyNode>,
		imgElement: Cheerio<AnyNode>,
		$: CheerioAPI
	): string | null {
		// Try to extract original image URL from Naver's data-linkdata attribute
		const imageLink = $el.find('a.__se_image_link, a.se-module-image-link');

		if (imageLink.length > 0) {
			const linkData = imageLink.attr('data-linkdata');
			if (linkData) {
				try {
					const data = JSON.parse(linkData);
					if (data.src) return data.src;
				} catch {
					// Continue
				}
			}
		}

		// Check script tags for image data (newer format)
		const scriptElement = $el.find('script.__se_module_data, script[data-module-v2]');
		if (scriptElement.length > 0) {
			const scriptContent = scriptElement.attr('data-module-v2') || scriptElement.html();
			if (scriptContent) {
				try {
					const data = JSON.parse(scriptContent);
					if (data.data?.src) return data.data.src;
					if (data.data?.imageInfo?.src) return data.data.imageInfo.src;
				} catch {
					// Continue
				}
			}
		}

		return null;
	}

	/**
	 * Parse oembed component (YouTube, etc.) and extract link
	 * Uses Obsidian's native embed syntax: ![title](url) for YouTube
	 */
	private parseOembedComponent($component: Cheerio<AnyNode>, $: CheerioAPI): string {
		// Try to get data from script tag with data-module or data-module-v2
		const scriptEl = $component.find('script.__se_module_data, script[data-module]');

		if (scriptEl.length > 0) {
			const moduleData = scriptEl.attr('data-module-v2') || scriptEl.attr('data-module');
			if (moduleData) {
				try {
					const data = JSON.parse(moduleData);
					const oembedData = data.data;

					if (oembedData) {
						const url = oembedData.inputUrl || oembedData.url || '';
						const title = oembedData.title || '';

						if (url) {
							// YouTube: Use Obsidian native embed syntax
							if (url.includes('youtube.com') || url.includes('youtu.be')) {
								return `![${title || 'YouTube'}](${url})\n\n`;
							}
							// Other embeds: Use link format
							return `[${title || '임베드 콘텐츠'}](${url})\n\n`;
						}
					}
				} catch {
					// Fall through to iframe check
				}
			}
		}

		// Fallback: try to extract URL from iframe src
		const iframe = $component.find('iframe');
		if (iframe.length > 0) {
			const src = iframe.attr('src') || '';
			const title = iframe.attr('title') || '';

			// Convert YouTube embed URL to watch URL
			if (src.includes('youtube.com/embed/')) {
				const videoId = src.match(/embed\/([^?&]+)/)?.[1];
				if (videoId) {
					const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
					return `![${title || 'YouTube'}](${watchUrl})\n\n`;
				}
			}

			if (src) {
				return `[${title || '임베드 콘텐츠'}](${src})\n\n`;
			}
		}

		return '[임베드 콘텐츠]\n\n';
	}

	/**
	 * Extract image URLs from HTML
	 */
	private extractImagesFromHtml(html: string): string[] {
		const $ = cheerio.load(html);
		const images: string[] = [];

		$('img').each((_, img) => {
			const src = $(img).attr('src');
			if (src && this.isContentImage(src)) {
				images.push(this.enhanceImageUrl(src));
			}
		});

		return images;
	}

	/**
	 * Check if URL is a content image (not UI element)
	 */
	private isContentImage(src: string): boolean {
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
		];

		for (const pattern of skipPatterns) {
			if (pattern.test(src)) return false;
		}

		return src.startsWith('http') || src.startsWith('//');
	}

	/**
	 * Enhance image URL to get higher quality
	 * Note: Cafe images should NOT be converted to blogfiles (causes 404)
	 */
	private enhanceImageUrl(src: string): string {
		// Convert dthumb proxy URLs and adjust type parameters for full-size
		// convertDthumbToDirectUrl now handles postfiles URLs and sets type=w2000
		return this.convertDthumbToDirectUrl(src);
	}

	/**
	 * Convert thumbnail/proxy URLs to full-size direct image URLs
	 * Handles:
	 * 1. dthumb-phinf.pstatic.net proxy URLs
	 * 2. postfiles URLs with type parameter (thumbnails)
	 * 3. Other Naver CDN thumbnail URLs
	 */
	private convertDthumbToDirectUrl(url: string): string {
		let resultUrl = url;

		// Handle dthumb-phinf.pstatic.net proxy URLs
		if (resultUrl.includes('dthumb-phinf.pstatic.net')) {
			try {
				const urlObj = new URL(resultUrl);
				const srcParam = urlObj.searchParams.get('src');
				if (srcParam) {
					// Remove surrounding quotes (srcParam is already URL-decoded by searchParams.get)
					resultUrl = srcParam.replace(/^["']|["']$/g, '');
				}
			} catch {
				// If URL parsing fails, continue with original URL
			}
		}

		// Convert http to https
		if (resultUrl.startsWith('http://')) {
			resultUrl = resultUrl.replace('http://', 'https://');
		}

		// For postfiles URLs, replace small type with large type for full-size image
		if (resultUrl.includes('postfiles')) {
			if (resultUrl.includes('type=')) {
				resultUrl = resultUrl.replace(/type=w\d+/gi, 'type=w2000');
				resultUrl = resultUrl.replace(/type=cafe_wa\d+/gi, 'type=w2000');
			} else {
				resultUrl += (resultUrl.includes('?') ? '&' : '?') + 'type=w2000';
			}
		} else {
			// For other domains, remove type parameters
			resultUrl = resultUrl.replace(/[?&]type=[^&]+/gi, '');
			resultUrl = resultUrl.replace(/[?&]$/, '');
		}

		return resultUrl;
	}

	/**
	 * Clean up content
	 */
	private cleanContent(content: string): string {
		return content
			.replace(/\r\n/g, '\n')
			.replace(/\n{3,}/g, '\n\n')
			.replace(/[ \t]+$/gm, '')
			// Remove zero-width and invisible Unicode characters that cause display issues
			.replace(/[\u200B-\u200F\u2028-\u202F\uFEFF]/g, '')
			// Remove replacement character (often appears when encoding fails)
			.replace(/\uFFFD/g, '')
			.trim();
	}

	/**
	 * Parse date string to YYYY-MM-DD format
	 */
	private parseDate(dateText: string): string {
		if (!dateText) return new Date().toISOString().split('T')[0];

		const cleanText = dateText.trim();

		// Try various patterns
		const patterns = [
			/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/,  // 2024. 01. 01
			/(\d{4})-(\d{1,2})-(\d{1,2})/,           // 2024-01-01
			/(\d{4})\/(\d{1,2})\/(\d{1,2})/,         // 2024/01/01
		];

		for (const pattern of patterns) {
			const match = cleanText.match(pattern);
			if (match) {
				const year = match[1];
				const month = match[2].padStart(2, '0');
				const day = match[3].padStart(2, '0');
				return `${year}-${month}-${day}`;
			}
		}

		// Try to parse as Date
		try {
			const date = new Date(cleanText);
			if (!isNaN(date.getTime())) {
				return date.toISOString().split('T')[0];
			}
		} catch {
			// Ignore
		}

		return new Date().toISOString().split('T')[0];
	}

	/**
	 * Get headers for requests
	 */
	private getHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
			'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
			'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
		};

		if (this.cookie) {
			headers['Cookie'] = this.cookie;
		}

		return headers;
	}

	/**
	 * Delay helper
	 */
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Static method to parse cafe URL
	 */
	static parseCafeUrl = parseCafeUrl;
}
