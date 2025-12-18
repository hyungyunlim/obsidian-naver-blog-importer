import { App, Notice } from 'obsidian';
import { NaverCafeFetcher } from '../fetchers/naver-cafe-fetcher';
import type { NaverCafeSettings, ProcessedCafePost, CafeArticleDetail } from '../types';

export class CafeService {
	constructor(
		private app: App,
		private settings: NaverCafeSettings,
		private createMarkdownFile: (post: ProcessedCafePost) => Promise<void>
	) {}

	/**
	 * Import a single cafe article
	 */
	async importSingleArticle(cafeIdOrUrl: string, articleId: string): Promise<ProcessedCafePost> {
		try {
			// Warn if no cookie is set
			if (!this.settings.naverCookie) {
				new Notice('⚠️ 네이버 쿠키가 설정되지 않았습니다. 비공개 카페의 경우 가져오기가 실패할 수 있습니다.', 5000);
			}

			new Notice(`Importing cafe article ${articleId}...`, 3000);

			const fetcher = new NaverCafeFetcher(cafeIdOrUrl, this.settings.naverCookie);
			const article = await fetcher.fetchSingleArticle(articleId);

			if (!article) {
				throw new Error('Article not found or could not be fetched');
			}

			const processedPost = this.convertToProcessedPost(article);
			await this.createMarkdownFile(processedPost);

			new Notice(`Cafe article imported: ${processedPost.title}`, 4000);
			return processedPost;
		} catch (error) {
			new Notice(`Failed to import cafe article: ${error.message}`, 5000);
			throw error;
		}
	}

	/**
	 * Import from URL (auto-parse cafeUrl and articleId)
	 */
	async importFromUrl(url: string): Promise<ProcessedCafePost> {
		const parsed = NaverCafeFetcher.parseCafeUrl(url);

		if (!parsed || !parsed.articleId) {
			throw new Error('Invalid cafe URL. Please provide a valid Naver Cafe article URL.');
		}

		const cafeIdentifier = parsed.cafeUrl || parsed.cafeId;
		if (!cafeIdentifier) {
			throw new Error('Could not extract cafe identifier from URL.');
		}

		return this.importSingleArticle(cafeIdentifier, parsed.articleId);
	}

	/**
	 * Fetch cafe articles from a specific menu (board)
	 * @param skipCookieWarning - Skip cookie warning if already shown by caller
	 */
	async fetchCafeArticles(
		cafeIdOrUrl: string,
		menuId?: number,
		maxArticles = 10,
		cafeName?: string,
		skipCookieWarning = false
	): Promise<ProcessedCafePost[]> {
		let fetchNotice: Notice | null = null;

		try {
			// Warn if no cookie is set (only once per fetch operation)
			if (!skipCookieWarning && !this.settings.naverCookie) {
				new Notice('⚠️ 네이버 쿠키가 설정되지 않았습니다. 비공개 카페의 경우 가져오기가 실패할 수 있습니다.', 5000);
			}

			fetchNotice = new Notice('Fetching cafe articles...', 0);

			const fetcher = new NaverCafeFetcher(cafeIdOrUrl, this.settings.naverCookie);
			const articles = await fetcher.fetchArticles(menuId, maxArticles);

			if (fetchNotice) {
				fetchNotice.hide();
				fetchNotice = null;
			}

			// Filter articles based on settings
			let filteredArticles = articles;

			if (this.settings.excludeNotice) {
				filteredArticles = filteredArticles.filter(a => !a.isNotice);
			}

			if (this.settings.excludeRecommended) {
				filteredArticles = filteredArticles.filter(a => !a.isRecommended);
			}

			if (this.settings.minContentLength > 0) {
				filteredArticles = filteredArticles.filter(
					a => a.content.length >= this.settings.minContentLength
				);
			}

			// Filter duplicates if enabled
			if (this.settings.enableCafeDuplicateCheck) {
				const existingArticleIds = this.getExistingArticleIds();
				const beforeCount = filteredArticles.length;
				filteredArticles = filteredArticles.filter(
					a => !existingArticleIds.has(a.articleId)
				);
				const newCount = filteredArticles.length;
				new Notice(
					`Found ${beforeCount} articles, ${newCount} new after duplicate check`,
					4000
				);
			} else {
				new Notice(`Found ${filteredArticles.length} articles`, 4000);
			}

			// Convert to ProcessedCafePost
			return filteredArticles.map(article => this.convertToProcessedPost(article, cafeName));
		} catch (error) {
			if (fetchNotice) {
				fetchNotice.hide();
			}
			new Notice(`Failed to fetch cafe articles: ${error.message}`, 5000);
			throw error;
		}
	}

	/**
	 * Sync subscribed cafes
	 */
	async syncSubscribedCafes(): Promise<void> {
		if (this.settings.subscribedCafes.length === 0) {
			new Notice('No subscribed cafes. Add cafes in settings first.', 4000);
			return;
		}

		// Warn once at the start if no cookie is set
		if (!this.settings.naverCookie) {
			new Notice('⚠️ 네이버 쿠키가 설정되지 않았습니다. 비공개 카페의 경우 가져오기가 실패할 수 있습니다.', 5000);
		}

		const syncNotice = new Notice('Syncing subscribed cafes...', 0);
		let totalNewPosts = 0;
		let totalErrors = 0;
		const totalCafes = this.settings.subscribedCafes.length;

		try {
			for (let i = 0; i < this.settings.subscribedCafes.length; i++) {
				const subscription = this.settings.subscribedCafes[i];
				const progress = `(${i + 1}/${totalCafes})`;

				try {
					new Notice(
						`Syncing cafe ${progress}: ${subscription.cafeName} (${subscription.postCount} posts)`,
						5000
					);

					// Fetch from each subscribed menu, or all if no specific menus
					const menuIds =
						subscription.menuIds.length > 0
							? subscription.menuIds
							: [undefined]; // undefined = all menus

					for (const menuId of menuIds) {
						const posts = await this.fetchCafeArticles(
							subscription.cafeUrl || subscription.cafeId,
							menuId,
							subscription.postCount,
							subscription.cafeName,
							true // skipCookieWarning - already shown at sync start
						);

						for (const post of posts) {
							try {
								await this.createMarkdownFile(post);
								totalNewPosts++;
							} catch (error) {
								totalErrors++;
							}
							await new Promise(resolve => setTimeout(resolve, 500));
						}
					}
				} catch (error) {
					totalErrors++;
				}

				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		} finally {
			syncNotice.hide();
			if (totalNewPosts > 0 || totalErrors > 0) {
				new Notice(
					`Sync completed: ${totalNewPosts} posts imported, ${totalErrors} errors`,
					5000
				);
			} else {
				new Notice('Sync completed: no new posts found', 5000);
			}
		}
	}

	/**
	 * Get existing article IDs from vault
	 */
	getExistingArticleIds(): Set<string> {
		const existingIds = new Set<string>();
		try {
			const files = this.app.vault.getMarkdownFiles();
			for (const file of files) {
				const cache = this.app.metadataCache.getFileCache(file);
				if (cache?.frontmatter?.articleId) {
					existingIds.add(cache.frontmatter.articleId);
				}
				// Also check cafeArticleId for backwards compatibility
				if (cache?.frontmatter?.cafeArticleId) {
					existingIds.add(cache.frontmatter.cafeArticleId);
				}
			}
		} catch {
			// Continue
		}
		return existingIds;
	}

	/**
	 * Convert CafeArticleDetail to ProcessedCafePost
	 */
	private convertToProcessedPost(article: CafeArticleDetail, overrideCafeName?: string): ProcessedCafePost {
		return {
			title: this.cleanTitle(article.title),
			content: article.content,
			contentHtml: article.contentHtml, // 비디오 추출용 원본 HTML
			date: article.writeDate,
			articleId: article.articleId,
			cafeId: article.cafeId,
			cafeName: overrideCafeName || article.cafeName || '',
			cafeUrl: article.url.match(/cafe\.naver\.com\/([^/]+)/)?.[1] || article.cafeId,
			menuId: article.menuId,
			menuName: article.menuName || '',
			author: article.writerNickname,
			url: article.url,
			tags: article.tags,
			excerpt: this.generateExcerpt(article.content),
			viewCount: article.viewCount,
			commentCount: article.commentCount,
			comments: article.comments,
		};
	}

	/**
	 * Clean title (remove brackets, etc.)
	 */
	private cleanTitle(title: string): string {
		return title
			.replace(/^\[.*?\]\s*/, '')
			.replace(/\s*\[.*?\]$/, '')
			.trim();
	}

	/**
	 * Generate excerpt from content
	 */
	private generateExcerpt(content: string, maxLength = 200): string {
		// Remove markdown syntax and get plain text
		const plainText = content
			.replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
			.replace(/\[.*?\]\(.*?\)/g, '')   // Remove links
			.replace(/[#*`>-]/g, '')          // Remove markdown chars
			.replace(/\n+/g, ' ')             // Replace newlines
			.trim();

		if (plainText.length <= maxLength) {
			return plainText;
		}

		return plainText.substring(0, maxLength).trim() + '...';
	}

	/**
	 * Update settings
	 */
	updateSettings(newSettings: NaverCafeSettings): void {
		this.settings = newSettings;
	}
}
