import { App, Notice } from 'obsidian';
import { NaverBlogFetcher } from '../../naver-blog-fetcher';
import { NaverBlogSettings, ProcessedBlogPost } from '../types';

export interface SyncOptions {
	silent?: boolean;  // Suppress intermediate notices (for auto-sync)
}

export interface SyncResult {
	newPosts: number;
	errors: number;
	blogId?: string;
}

export class BlogService {
	constructor(
		private app: App,
		private settings: NaverBlogSettings,
		private createMarkdownFile: (post: ProcessedBlogPost) => Promise<void>
	) {}

	async fetchNaverBlogPosts(blogId: string, maxPosts?: number, options?: SyncOptions): Promise<ProcessedBlogPost[]> {
		const silent = options?.silent ?? false;
		let fetchNotice: Notice | null = null;

		try {
			if (!silent) {
				fetchNotice = new Notice('Fetching blog posts...', 0);
			}

			// Use settings value if maxPosts is not provided and settings value is > 0
			const effectiveMaxPosts = maxPosts || (this.settings.postImportLimit > 0 ? this.settings.postImportLimit : undefined);

			const fetcher = new NaverBlogFetcher(blogId);
			const posts = await fetcher.fetchPosts(effectiveMaxPosts);

			// Hide the persistent notice
			if (fetchNotice) {
				fetchNotice.hide();
				fetchNotice = null;
			}

			// Filter out duplicates if enabled
			let filteredPosts = posts;
			if (this.settings.enableDuplicateCheck) {
				const existingLogNos = this.getExistingLogNos();
				filteredPosts = posts.filter(post => !existingLogNos.has(post.logNo));
				if (!silent) {
					new Notice(`Found ${posts.length} posts, ${filteredPosts.length} new posts after duplicate check`, 4000);
				}
			} else if (!silent) {
				new Notice(`Found ${posts.length} posts`, 4000);
			}

			if (!silent) {
				new Notice(`Processing ${filteredPosts.length} posts...`, 3000);
			}

			// Convert to ProcessedBlogPost - use original tags from blog
			const processedPosts: ProcessedBlogPost[] = filteredPosts.map(post => ({
				...post,
				title: post.title.replace(/^\[.*?\]\s*/, '').replace(/\s*\[.*?\]$/, '').trim(), // Remove [] brackets from title start/end
				tags: post.originalTags || [],
				excerpt: ''
			}));

			return processedPosts;

		} catch (error) {
			// Hide the persistent notice in case of error
			if (fetchNotice) {
				fetchNotice.hide();
				fetchNotice = null;
			}

			if (!silent) {
				new Notice(`❌ Failed to fetch posts from ${blogId}: ${error.message}`, 5000);
			}
			throw error;
		}
	}

	getExistingLogNos(): Set<string> {
		const existingLogNos = new Set<string>();
		try {
			const files = this.app.vault.getMarkdownFiles();
			for (const file of files) {
				const cache = this.app.metadataCache.getFileCache(file);
				if (cache?.frontmatter?.logNo) {
					existingLogNos.add(cache.frontmatter.logNo);
				}
			}
		} catch {
			// Continue processing remaining subscriptions
		}
		return existingLogNos;
	}

	async syncSubscribedBlogs(options?: SyncOptions): Promise<SyncResult> {
		const silent = options?.silent ?? false;
		const result: SyncResult = { newPosts: 0, errors: 0 };

		if (this.settings.subscribedBlogs.length === 0) return result;

		let syncNotice: Notice | null = null;
		if (!silent) {
			syncNotice = new Notice('Syncing subscribed blogs...', 0);
		}

		const totalBlogs = this.settings.subscribedBlogs.length;

		try {
			for (let i = 0; i < this.settings.subscribedBlogs.length; i++) {
				const blogId = this.settings.subscribedBlogs[i];

				// Get blog-specific post count or use default
				const blogSubscription = this.settings.blogSubscriptions.find(sub => sub.blogId === blogId);
				const postCount = blogSubscription?.postCount || 10;

				try {
					if (!silent) {
						const blogProgress = `(${i + 1}/${totalBlogs})`;
						new Notice(`Syncing blog ${blogProgress}: ${blogId} (${postCount} posts)`, 5000);
					}

					const posts = await this.fetchNaverBlogPosts(blogId, postCount, { silent });

					for (let j = 0; j < posts.length; j++) {
						const post = posts[j];

						try {
							if (!silent) {
								const postProgress = `(${i + 1}/${totalBlogs}) post (${j + 1}/${posts.length})`;
								new Notice(`Creating ${postProgress}: ${post.title}`, 3000);
							}
							await this.createMarkdownFile(post);
							result.newPosts++;
						} catch {
							result.errors++;
						}
						await new Promise(resolve => setTimeout(resolve, 500));
					}

				} catch {
					result.errors++;
				}

				// Add delay between blogs
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		} finally {
			if (syncNotice) {
				syncNotice.hide();
			}
			if (!silent) {
				if (result.newPosts > 0 || result.errors > 0) {
					new Notice(`Sync completed: ${result.newPosts} posts imported, ${result.errors} errors`, 5000);
				} else {
					new Notice('Sync completed: no new posts found', 5000);
				}
			}
		}

		return result;
	}

	async importSinglePost(blogId: string, logNo: string): Promise<void> {
		try {
			new Notice(`Importing post ${logNo} from ${blogId}...`, 3000);

			const fetcher = new NaverBlogFetcher(blogId);
			const post = await fetcher.fetchSinglePost(logNo);

			if (!post) {
				throw new Error('Post not found or could not be fetched');
			}

			// Convert to ProcessedBlogPost - use original tags from blog
			const processedPost: ProcessedBlogPost = {
				...post,
				title: post.title.replace(/^\[.*?\]\s*/, '').replace(/\s*\[.*?\]$/, '').trim(),
				tags: post.originalTags || [],
				excerpt: ''
			};

			await this.createMarkdownFile(processedPost);
			new Notice(`✅ Post imported successfully: ${processedPost.title}`, 4000);
			
		} catch (error) {
			new Notice(`❌ Failed to import post: ${error.message}`, 5000);
			throw error;
		}
	}

	// Helper method to update settings (for when blog subscriptions change)
	updateSettings(newSettings: NaverBlogSettings) {
		this.settings = newSettings;
	}
}