import { App, Notice } from 'obsidian';
import { BrunchFetcher } from '../../brunch-fetcher';
import { NaverBlogSettings, ProcessedBrunchPost, BrunchSubscription } from '../types';

export class BrunchService {
	constructor(
		private app: App,
		private settings: NaverBlogSettings,
		private createMarkdownFile: (post: ProcessedBrunchPost) => Promise<void>
	) {}

	/**
	 * Fetch posts from a Brunch author
	 */
	async fetchBrunchPosts(username: string, maxPosts?: number): Promise<ProcessedBrunchPost[]> {
		let fetchNotice: Notice | null = null;
		try {
			fetchNotice = new Notice('Fetching Brunch posts...', 0);

			const fetcher = new BrunchFetcher(username);
			const posts = await fetcher.fetchPosts(maxPosts);

			if (fetchNotice) {
				fetchNotice.hide();
				fetchNotice = null;
			}

			// Filter out duplicates if enabled
			let filteredPosts = posts;
			if (this.settings.brunchSettings?.enableBrunchDuplicateCheck) {
				const existingPostIds = this.getExistingBrunchPostIds();
				filteredPosts = posts.filter(post => !existingPostIds.has(post.postId));
				new Notice(`Found ${posts.length} posts, ${filteredPosts.length} new posts after duplicate check`, 4000);
			} else {
				new Notice(`Found ${posts.length} posts`, 4000);
			}

			new Notice(`Processing ${filteredPosts.length} posts...`, 3000);

			return filteredPosts;

		} catch (error) {
			if (fetchNotice) {
				fetchNotice.hide();
				fetchNotice = null;
			}

			new Notice(`Failed to fetch posts from @${username}: ${error.message}`, 5000);
			throw error;
		}
	}

	/**
	 * Import a single Brunch post by URL or username/postId
	 */
	async importSinglePost(input: string): Promise<void> {
		try {
			let username: string;
			let postId: string;

			// Check if input is a URL
			if (input.includes('brunch.co.kr')) {
				const parsed = BrunchFetcher.parsePostUrl(input);
				if (!parsed) {
					throw new Error('Invalid Brunch URL format');
				}
				username = parsed.username;
				postId = parsed.postId;
			} else if (input.includes('/')) {
				// Format: username/postId
				const parts = input.split('/');
				username = parts[0].replace('@', '');
				postId = parts[1];
			} else {
				throw new Error('Please provide a Brunch URL or username/postId');
			}

			new Notice(`Importing Brunch post ${postId} from @${username}...`, 3000);

			const fetcher = new BrunchFetcher(username);
			const post = await fetcher.fetchSinglePost(postId);

			await this.createMarkdownFile(post);
			new Notice(`Brunch post imported: ${post.title}`, 4000);

		} catch (error) {
			new Notice(`Failed to import Brunch post: ${error.message}`, 5000);
			throw error;
		}
	}

	/**
	 * Get existing Brunch post IDs from vault (for duplicate check)
	 */
	getExistingBrunchPostIds(): Set<string> {
		const existingPostIds = new Set<string>();
		try {
			const files = this.app.vault.getMarkdownFiles();
			for (const file of files) {
				const cache = this.app.metadataCache.getFileCache(file);
				// Check for Brunch-specific frontmatter
				if (cache?.frontmatter?.platform === 'brunch' && cache?.frontmatter?.postId) {
					existingPostIds.add(cache.frontmatter.postId);
				}
			}
		} catch {
			// Continue if there's an error
		}
		return existingPostIds;
	}

	/**
	 * Sync a single Brunch author subscription
	 */
	async syncSingleAuthor(subscription: BrunchSubscription): Promise<void> {
		try {
			const posts = await this.fetchBrunchPosts(subscription.authorUsername, subscription.postCount);

			for (let j = 0; j < posts.length; j++) {
				const post = posts[j];
				const postProgress = `(${j + 1}/${posts.length})`;

				try {
					new Notice(`Creating ${postProgress}: ${post.title}`, 3000);
					await this.createMarkdownFile(post);
				} catch {
					// Continue on error
				}
				await new Promise(resolve => setTimeout(resolve, 500));
			}

			// Update last checked time
			subscription.lastCheckedAt = new Date().toISOString();
			if (posts.length > 0) {
				subscription.lastPostId = posts[0].postId;
			}
		} catch (error) {
			new Notice(`Failed to sync @${subscription.authorUsername}: ${error.message}`, 5000);
			throw error;
		}
	}

	/**
	 * Sync all subscribed Brunch authors
	 */
	async syncSubscribedAuthors(): Promise<void> {
		const subscriptions = this.settings.brunchSettings?.subscribedBrunchAuthors || [];
		if (subscriptions.length === 0) return;

		const syncNotice = new Notice('Syncing subscribed Brunch authors...', 0);
		let totalNewPosts = 0;
		let totalErrors = 0;
		const totalAuthors = subscriptions.length;

		try {
			for (let i = 0; i < subscriptions.length; i++) {
				const subscription = subscriptions[i];
				const authorProgress = `(${i + 1}/${totalAuthors})`;

				try {
					new Notice(`Syncing Brunch ${authorProgress}: @${subscription.authorUsername} (${subscription.postCount} posts)`, 5000);
					const posts = await this.fetchBrunchPosts(subscription.authorUsername, subscription.postCount);

					for (let j = 0; j < posts.length; j++) {
						const post = posts[j];
						const postProgress = `${authorProgress} post (${j + 1}/${posts.length})`;

						try {
							new Notice(`Creating ${postProgress}: ${post.title}`, 3000);
							await this.createMarkdownFile(post);
							totalNewPosts++;
						} catch {
							totalErrors++;
						}
						await new Promise(resolve => setTimeout(resolve, 500));
					}

					// Update last checked time
					subscription.lastCheckedAt = new Date().toISOString();
					if (posts.length > 0) {
						subscription.lastPostId = posts[0].postId;
					}

				} catch {
					totalErrors++;
				}

				// Add delay between authors
				await new Promise(resolve => setTimeout(resolve, 1000));
			}
		} finally {
			syncNotice.hide();
			if (totalNewPosts > 0 || totalErrors > 0) {
				new Notice(`Brunch sync completed: ${totalNewPosts} posts imported, ${totalErrors} errors`, 5000);
			} else {
				new Notice('Brunch sync completed: no new posts found', 5000);
			}
		}
	}

	/**
	 * Add a new Brunch author subscription
	 */
	async addSubscription(username: string, postCount: number = 10): Promise<BrunchSubscription> {
		// Clean username
		const cleanUsername = username.replace(/^@/, '');

		// Check if already subscribed
		const existing = this.settings.brunchSettings?.subscribedBrunchAuthors?.find(
			sub => sub.authorUsername === cleanUsername
		);
		if (existing) {
			throw new Error(`Already subscribed to @${cleanUsername}`);
		}

		// Fetch author info to validate
		const fetcher = new BrunchFetcher(cleanUsername);
		const rssUrl = await fetcher.getRssUrl();

		// Extract userId from RSS URL if available
		let authorUserId: string | undefined;
		if (rssUrl) {
			const match = rssUrl.match(/@@(\w+)/);
			if (match) {
				authorUserId = match[1];
			}
		}

		const subscription: BrunchSubscription = {
			id: `brunch-${cleanUsername}-${Date.now()}`,
			platform: 'brunch',
			authorUsername: cleanUsername,
			authorUserId,
			rssUrl,
			postCount,
			createdAt: new Date().toISOString(),
		};

		return subscription;
	}

	/**
	 * Remove a Brunch author subscription
	 */
	removeSubscription(username: string): boolean {
		const cleanUsername = username.replace(/^@/, '');
		const subscriptions = this.settings.brunchSettings?.subscribedBrunchAuthors || [];
		const index = subscriptions.findIndex(sub => sub.authorUsername === cleanUsername);

		if (index >= 0) {
			subscriptions.splice(index, 1);
			return true;
		}

		return false;
	}

	/**
	 * Check for new posts from subscribed authors (using RSS)
	 */
	async checkNewPosts(subscription: BrunchSubscription): Promise<string[]> {
		const newPostUrls: string[] = [];

		if (!subscription.rssUrl) {
			// No RSS URL, use regular fetch
			const fetcher = new BrunchFetcher(subscription.authorUsername);
			const posts = await fetcher.fetchPosts(subscription.postCount);

			for (const post of posts) {
				if (subscription.lastPostId && post.postId === subscription.lastPostId) {
					break; // Reached last known post
				}
				newPostUrls.push(post.url);
			}
		} else {
			// Use RSS feed
			const fetcher = new BrunchFetcher(subscription.authorUsername);
			const items = await fetcher.parseRssFeed(subscription.rssUrl);

			for (const item of items) {
				if (subscription.lastPostId && item.guid.includes(subscription.lastPostId)) {
					break; // Reached last known post
				}
				newPostUrls.push(item.link);
			}
		}

		return newPostUrls;
	}

	/**
	 * Update settings reference
	 */
	updateSettings(newSettings: NaverBlogSettings) {
		this.settings = newSettings;
	}
}
