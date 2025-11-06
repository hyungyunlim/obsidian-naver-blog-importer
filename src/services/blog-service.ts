import { App, Notice } from 'obsidian';
import { NaverBlogFetcher } from '../../naver-blog-fetcher';
import { NaverBlogSettings, ProcessedBlogPost, BlogSubscription } from '../types';

export class BlogService {
	constructor(
		private app: App,
		private settings: NaverBlogSettings,
		private createMarkdownFile: (post: ProcessedBlogPost) => Promise<void>
	) {}

	async fetchNaverBlogPosts(blogId: string, maxPosts?: number): Promise<ProcessedBlogPost[]> {
		let fetchNotice: Notice | null = null;
		try {
			fetchNotice = new Notice('Fetching blog posts...', 0); // Persistent notice
			
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
			// Hide the persistent notice in case of error
			if (fetchNotice) {
				fetchNotice.hide();
				fetchNotice = null;
			}
			
			new Notice(`❌ Failed to fetch posts from ${blogId}: ${error.message}`, 5000);
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
				const postCount = blogSubscription?.postCount || 10;
				
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
								// blogErrorLogCount++;
							} else {
								// blogSuccessCount++;
							}
							totalNewPosts++;
						} catch (error) {
							// blogErrorCount++;
							totalErrors++;
						}
						await new Promise(resolve => setTimeout(resolve, 500));
					}
					
					// Blog sync completed for this blog
				} catch (error) {
					totalErrors++;
				}
				
				// Add delay between blogs
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		} finally {
			syncNotice.hide();
			if (totalNewPosts > 0 || totalErrors > 0) {
				new Notice(`Sync completed: ${totalNewPosts} posts imported, ${totalErrors} errors`, 5000);
			} else {
				new Notice('Sync completed: No new posts found', 5000);
			}
		}
	}

	async importSinglePost(blogId: string, logNo: string): Promise<void> {
		try {
			new Notice(`Importing post ${logNo} from ${blogId}...`, 3000);
			
			const fetcher = new NaverBlogFetcher(blogId);
			const post = await fetcher.fetchSinglePost(logNo);
			
			if (!post) {
				throw new Error('Post not found or could not be fetched');
			}
			
			// Convert to ProcessedBlogPost
			const processedPost: ProcessedBlogPost = {
				...post,
				title: post.title.replace(/^\[.*?\]\s*/, '').replace(/\s*\[.*?\]$/, '').trim(),
				tags: [],
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