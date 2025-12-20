import { requestUrl } from 'obsidian';
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { Element } from 'domhandler';
import type { ProcessedBrunchPost, BrunchSeries, BrunchVideo } from './src/types/brunch';
import {
	BRUNCH_BASE_URL,
	BRUNCH_POST_URL,
	BRUNCH_AUTHOR_URL,
	BRUNCH_URL_PATTERNS,
	BRUNCH_SELECTORS,
	BRUNCH_IMAGE_PATTERNS,
	BRUNCH_RATE_LIMITS,
} from './src/constants/brunch-endpoints';

// Kakao TV API endpoints
// Note: Using %40 instead of @ to avoid URL parsing issues in Obsidian's requestUrl
const KAKAO_TV_READY_PLAY_URL = (videoId: string) =>
	`https://play-tv.kakao.com/katz/v4/ft/cliplink/${videoId}%40my/readyNplay`;
const KAKAO_KAMP_VOD_URL = (videoId: string) =>
	`https://kamp.kakao.com/vod/v1/src/${videoId}`;

// Kakao TV video ID pattern (from iframe src or data-app)
const KAKAO_VIDEO_ID_PATTERN = /cliplink\/([a-z0-9]+)@my/i;

interface BrunchRssItem {
	title: string;
	link: string;
	pubDate: string;
	author: string;
	guid: string;
	description: string;
}

// Common headers to avoid bot detection and skip auto-login redirect
const BRUNCH_REQUEST_HEADERS = {
	'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
	'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
	'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
	'Referer': 'https://brunch.co.kr/',
	'Cookie': 'b_s_a_l=1',  // Skip auto-login redirect
	'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
	'sec-ch-ua-mobile': '?0',
	'sec-ch-ua-platform': '"macOS"',
	'sec-fetch-dest': 'document',
	'sec-fetch-mode': 'navigate',
	'sec-fetch-site': 'same-origin',
};

export class BrunchFetcher {
	private username: string;

	constructor(username: string) {
		// Remove @ prefix if present
		this.username = username.replace(/^@/, '');
	}

	/**
	 * Fetch a single post by post ID
	 */
	async fetchSinglePost(postId: string): Promise<ProcessedBrunchPost> {
		const url = BRUNCH_POST_URL(this.username, postId);

		try {
			console.log('[Brunch] Fetching URL:', url);

			// Use throw: false to handle redirects manually
			const response = await requestUrl({
				url: url,
				method: 'GET',
				headers: BRUNCH_REQUEST_HEADERS,
				throw: false
			});

			console.log('[Brunch] Response status:', response.status);
			console.log('[Brunch] Response headers:', response.headers);

			// Handle redirect manually if needed
			if (response.status >= 300 && response.status < 400) {
				const redirectUrl = response.headers['location'];
				console.log('[Brunch] Redirect to:', redirectUrl);
				if (redirectUrl) {
					const finalUrl = redirectUrl.startsWith('http') ? redirectUrl : `${BRUNCH_BASE_URL}${redirectUrl}`;
					const redirectResponse = await requestUrl({
						url: finalUrl,
						method: 'GET',
						headers: BRUNCH_REQUEST_HEADERS,
						throw: false
					});
					console.log('[Brunch] Redirect response status:', redirectResponse.status);
					if (redirectResponse.status === 200) {
						return this.parsePostContent(redirectResponse.text, finalUrl, postId);
					}
				}
				throw new Error(`Redirect failed: ${response.status}`);
			}

			if (response.status !== 200) {
				throw new Error(`Failed to fetch post: HTTP ${response.status}`);
			}

			console.log('[Brunch] Content length:', response.text?.length);
			return this.parsePostContent(response.text, url, postId);
		} catch (error) {
			console.error('[Brunch] Error:', error);
			throw new Error(`Failed to fetch Brunch post ${postId}: ${error.message}`);
		}
	}

	/**
	 * Fetch multiple posts from an author's page
	 */
	async fetchPosts(maxPosts?: number): Promise<ProcessedBrunchPost[]> {
		const posts: ProcessedBrunchPost[] = [];
		const postIds = await this.getPostList(maxPosts);
		const limit = maxPosts || postIds.length;

		for (let i = 0; i < Math.min(postIds.length, limit); i++) {
			try {
				const post = await this.fetchSinglePost(postIds[i]);
				posts.push(post);

				// Rate limiting
				if (i < postIds.length - 1) {
					await this.delay(BRUNCH_RATE_LIMITS.requestDelay);
				}
			} catch (error) {
				console.error(`Failed to fetch post ${postIds[i]}:`, error);
				// Continue with other posts
			}
		}

		return posts;
	}

	/**
	 * Get list of post IDs from author's page
	 */
	private async getPostList(maxPosts?: number): Promise<string[]> {
		const url = BRUNCH_AUTHOR_URL(this.username);
		const postIds: string[] = [];

		try {
			const response = await requestUrl({
				url: url,
				method: 'GET',
				headers: BRUNCH_REQUEST_HEADERS
			});

			const $ = cheerio.load(response.text);

			// Find post links on author page
			$('a[href*="/@' + this.username + '/"]').each((_, el) => {
				const href = $(el).attr('href');
				if (href) {
					const match = href.match(BRUNCH_URL_PATTERNS.post);
					if (match && match[2]) {
						const postId = match[2];
						if (!postIds.includes(postId)) {
							postIds.push(postId);
						}
					}
				}
			});

			// Also try to find RSS URL for more complete list
			const rssLink = $(BRUNCH_SELECTORS.rssLink).attr('href');
			if (rssLink) {
				const rssPostIds = await this.getPostIdsFromRss(rssLink);
				for (const id of rssPostIds) {
					if (!postIds.includes(id)) {
						postIds.push(id);
					}
				}
			}

		} catch (error) {
			console.error('Failed to get post list:', error);
		}

		// Sort by ID (descending - newest first)
		postIds.sort((a, b) => parseInt(b) - parseInt(a));

		return maxPosts ? postIds.slice(0, maxPosts) : postIds;
	}

	/**
	 * Get post IDs from RSS feed
	 */
	private async getPostIdsFromRss(rssUrl: string): Promise<string[]> {
		const postIds: string[] = [];

		try {
			// Ensure URL is absolute
			const fullUrl = rssUrl.startsWith('http') ? rssUrl : `${BRUNCH_BASE_URL}${rssUrl}`;

			const response = await requestUrl({
				url: fullUrl,
				method: 'GET',
				headers: {
					...BRUNCH_REQUEST_HEADERS,
					'Accept': 'application/rss+xml, application/xml, text/xml',
				}
			});

			const $ = cheerio.load(response.text, { xmlMode: true });

			$('item').each((_, item) => {
				const link = $(item).find('link').text() || $(item).find('guid').text();
				if (link) {
					const match = link.match(/\/(\d+)$/);
					if (match) {
						postIds.push(match[1]);
					}
				}
			});

		} catch (error) {
			console.error('Failed to fetch RSS:', error);
		}

		return postIds;
	}

	/**
	 * Parse post content from HTML
	 */
	private async parsePostContent(html: string, url: string, postId: string): Promise<ProcessedBrunchPost> {
		const $ = cheerio.load(html);

		// Extract metadata from OG tags
		const title = this.extractOgMeta($, 'og:title') || 'Untitled';
		const description = this.extractOgMeta($, 'og:description') || '';
		const thumbnail = this.extractOgMeta($, 'og:image');
		const regDate = this.extractOgMeta($, 'og:regDate');
		const authorName = this.extractOgMeta($, 'og:article:author') || this.username;

		// Parse date
		const date = this.parseDate(regDate);

		// Extract keywords/tags
		const keywords = this.extractKeywords($);

		// Extract series info
		const series = this.extractSeriesInfo($);

		// Extract engagement data
		const { likes, comments } = this.extractEngagement($);

		// Extract subtitle from page
		const subtitle = this.extractSubtitle($);

		// Convert body to markdown (also extracts video IDs)
		const { markdown, contentHtml, videoIds } = this.convertBodyToMarkdown($);

		// Fetch video info for all Kakao TV videos
		const videos: BrunchVideo[] = [];
		for (const videoId of videoIds) {
			const videoInfo = await this.getKakaoVideoInfo(videoId, url);
			if (videoInfo) {
				videos.push(videoInfo);
			}
		}

		return {
			title: this.cleanTitle(title),
			subtitle,
			date,
			content: markdown,
			contentHtml,
			postId,
			url,
			thumbnail: thumbnail ? this.normalizeImageUrl(thumbnail) : undefined,
			username: this.username,
			authorName,
			originalTags: keywords,
			series,
			likes,
			comments,
			videos: videos.length > 0 ? videos : undefined,
		};
	}

	/**
	 * Extract OG meta tag content
	 */
	private extractOgMeta($: CheerioAPI, property: string): string | undefined {
		const content = $(`meta[property="${property}"]`).attr('content');
		return content?.trim();
	}

	/**
	 * Extract keywords from keyword links
	 */
	private extractKeywords($: CheerioAPI): string[] {
		const keywords: string[] = [];
		$(BRUNCH_SELECTORS.keywordLink).each((_, el) => {
			const text = $(el).text().trim();
			if (text && !keywords.includes(text)) {
				keywords.push(text);
			}
		});
		return keywords;
	}

	/**
	 * Extract series information
	 */
	private extractSeriesInfo($: CheerioAPI): BrunchSeries | undefined {
		const seriesLink = $(BRUNCH_SELECTORS.seriesLink).first();
		if (seriesLink.length === 0) return undefined;

		const href = seriesLink.attr('href');
		const title = seriesLink.text().trim();

		if (!href || !title) return undefined;

		// Try to extract episode number from title (e.g., "01화", "23화")
		const episodeMatch = title.match(/(\d+)화/);
		const episode = episodeMatch ? parseInt(episodeMatch[1]) : undefined;

		return {
			title: title.replace(/\d+화\s*/, '').trim(),
			url: href.startsWith('http') ? href : `${BRUNCH_BASE_URL}${href}`,
			episode,
		};
	}

	/**
	 * Extract engagement data (likes, comments)
	 */
	private extractEngagement($: CheerioAPI): { likes?: number; comments?: number } {
		let likes: number | undefined;
		let comments: number | undefined;

		// Find buttons with engagement data
		$('button').each((_, el) => {
			const text = $(el).text();

			const likeMatch = text.match(/라이킷\s*(\d+)/);
			if (likeMatch) {
				likes = parseInt(likeMatch[1]);
			}

			const commentMatch = text.match(/댓글\s*(\d+)/);
			if (commentMatch) {
				comments = parseInt(commentMatch[1]);
			}
		});

		return { likes, comments };
	}

	/**
	 * Extract subtitle
	 */
	private extractSubtitle($: CheerioAPI): string | undefined {
		// Subtitle is often after the main title
		const description = this.extractOgMeta($, 'og:description');
		if (description) {
			// Extract text before the pipe character
			const parts = description.split('|');
			if (parts.length > 1) {
				return parts[0].trim();
			}
		}
		return undefined;
	}

	/**
	 * Convert wrap_body content to markdown
	 */
	private convertBodyToMarkdown($: CheerioAPI): { markdown: string; contentHtml: string; videoIds: string[] } {
		const wrapBody = $(BRUNCH_SELECTORS.wrapBody);
		const contentHtml = wrapBody.html() || '';
		const lines: string[] = [];
		let currentParagraph: string[] = [];
		const videoIds: string[] = [];

		const flushParagraph = () => {
			if (currentParagraph.length > 0) {
				lines.push(currentParagraph.join('\n'));
				lines.push('');
				currentParagraph = [];
			}
		};

		wrapBody.find(BRUNCH_SELECTORS.wrapItem).each((_, item) => {
			const $item = $(item);
			const classList = [...(item as Element).attribs?.class?.split(' ') || []];

			if (classList.includes('item_type_text')) {
				const tagName = (item as Element).tagName?.toLowerCase();

				// Replace <br> tags with newlines before extracting text
				$item.find('br').replaceWith('\n');
				const text = $item.text();

				if (!text.trim()) {
					// Empty text item = paragraph break
					flushParagraph();
				} else if (tagName === 'h2') {
					flushParagraph();
					lines.push(`## ${text.trim()}`);
					lines.push('');
				} else if (tagName === 'h3') {
					flushParagraph();
					lines.push(`### ${text.trim()}`);
					lines.push('');
				} else {
					// Preserve line breaks from <br> tags
					// Split by newlines and process each segment
					const segments = text.split('\n');
					for (const segment of segments) {
						const trimmed = segment.trim();
						if (trimmed) {
							currentParagraph.push(trimmed);
						} else if (currentParagraph.length > 0) {
							// Empty line = paragraph break (user intentional spacing)
							flushParagraph();
						}
					}
				}
			} else if (classList.includes('item_type_img')) {
				flushParagraph();

				const img = $item.find('img');
				const caption = $item.find(BRUNCH_SELECTORS.imgCaption).text().trim();

				if (img.length > 0) {
					let src = img.attr('data-src') || img.attr('src') || '';
					src = this.normalizeImageUrl(src);

					if (src) {
						lines.push(`![${caption || ''}](${src})`);
						if (caption) {
							lines.push(`*${caption}*`);
						}
						lines.push('');
					}
				}
			} else if (classList.includes('item_type_gridGallery')) {
				flushParagraph();

				// Parse grid gallery images from data-app attribute
				const dataApp = $item.attr('data-app');
				if (dataApp) {
					try {
						const data = JSON.parse(dataApp);
						if (data.images && Array.isArray(data.images)) {
							for (const image of data.images) {
								if (image.url) {
									const src = this.normalizeImageUrl(image.url);
									if (src) {
										lines.push(`![](${src})`);
									}
								}
							}
							lines.push('');
						}
					} catch {
						// Fallback: try to extract images from img tags
						$item.find('img').each((_, imgEl) => {
							let src = $(imgEl).attr('data-src') || $(imgEl).attr('src') || '';
							src = this.normalizeImageUrl(src);
							if (src) {
								lines.push(`![](${src})`);
							}
						});
						lines.push('');
					}
				} else {
					// No data-app, extract from img tags
					$item.find('img').each((_, imgEl) => {
						let src = $(imgEl).attr('data-src') || $(imgEl).attr('src') || '';
						src = this.normalizeImageUrl(src);
						if (src) {
							lines.push(`![](${src})`);
						}
					});
					lines.push('');
				}

				const caption = $item.find(BRUNCH_SELECTORS.imgCaption).text().trim();
				if (caption) {
					lines.push(`*${caption}*`);
					lines.push('');
				}
			} else if (classList.includes('item_type_hr')) {
				flushParagraph();
				lines.push('---');
				lines.push('');
			} else if (classList.includes('item_type_quotation')) {
				flushParagraph();

				const quoteText = $item.text().trim();
				if (quoteText) {
					const quotedLines = quoteText.split('\n').map(line => `> ${line.trim()}`);
					lines.push(quotedLines.join('\n'));
					lines.push('');
				}
			} else if (classList.includes('item_type_video')) {
				flushParagraph();

				let videoUrl: string | undefined;
				let videoId: string | null = null;

				// Try to extract video URL from data-app attribute
				const dataApp = $item.attr('data-app');
				if (dataApp) {
					try {
						const data = JSON.parse(dataApp);
						if (data.url) {
							videoUrl = data.url;
						}
						// Prefer direct id from data-app, fallback to extracting from URL
						if (data.id) {
							videoId = data.id;
						} else if (videoUrl) {
							videoId = this.extractKakaoVideoId(videoUrl);
						}
					} catch {
						// Ignore parse errors
					}
				}

				// Try to find iframe if no data-app
				if (!videoUrl) {
					const iframe = $item.find('iframe');
					const iframeSrc = iframe.attr('src');
					if (iframeSrc) {
						videoUrl = iframeSrc;
						videoId = this.extractKakaoVideoId(iframeSrc);
					}
				}

				// Collect video ID for later API call
				if (videoId && !videoIds.includes(videoId)) {
					videoIds.push(videoId);
				}

				// Add placeholder with video ID for later replacement
				if (videoId) {
					lines.push(`[Video:${videoId}](${videoUrl || ''})`);
				} else if (videoUrl) {
					lines.push(`[Video](${videoUrl})`);
				} else {
					lines.push('[Video]');
				}
				lines.push('');
			} else if (classList.includes('item_type_opengraph')) {
				flushParagraph();

				// Extract link from opengraph embed
				const link = $item.find('a').first().attr('href');
				const title = $item.find('a').first().text().trim() || 'Link';

				if (link) {
					lines.push(`[${title}](${link})`);
					lines.push('');
				}
			}
		});

		// Flush any remaining paragraph
		flushParagraph();

		// Clean up excessive blank lines
		const markdown = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

		return { markdown, contentHtml, videoIds };
	}

	/**
	 * Normalize image URL (handle protocol-relative URLs and CDN)
	 */
	private normalizeImageUrl(url: string): string {
		if (!url) return '';

		// Handle protocol-relative URLs
		if (url.startsWith('//')) {
			url = `https:${url}`;
		}

		// Extract original URL from daumcdn thumbnail if needed
		const fnameMatch = url.match(BRUNCH_IMAGE_PATTERNS.fnameParam);
		if (fnameMatch) {
			const originalUrl = decodeURIComponent(fnameMatch[1]);
			// Use high-res version instead of original
			return url.replace(BRUNCH_IMAGE_PATTERNS.thumbSize, BRUNCH_IMAGE_PATTERNS.highResFormat);
		}

		return url;
	}

	/**
	 * Parse date string to ISO format
	 */
	private parseDate(dateStr: string | undefined): string {
		if (!dateStr) {
			return new Date().toISOString().split('T')[0];
		}

		try {
			// Handle ISO format with timezone (e.g., "2025-12-17T12:30+09:00")
			const date = new Date(dateStr);
			if (!isNaN(date.getTime())) {
				return date.toISOString().split('T')[0];
			}
		} catch {
			// Fall through to default
		}

		return new Date().toISOString().split('T')[0];
	}

	/**
	 * Clean title (remove episode prefix, etc.)
	 */
	private cleanTitle(title: string): string {
		// Remove episode prefix like "01화 ", "23화 "
		let cleaned = title.replace(/^\d+화\s*/, '');

		// Remove any bracketed content at start
		cleaned = cleaned.replace(/^\[[^\]]+\]\s*/, '');

		return cleaned.trim() || title;
	}

	/**
	 * Get RSS URL for an author (by fetching their page)
	 */
	async getRssUrl(): Promise<string | undefined> {
		try {
			const url = BRUNCH_AUTHOR_URL(this.username);
			const response = await requestUrl({
				url: url,
				method: 'GET',
				headers: BRUNCH_REQUEST_HEADERS
			});

			const $ = cheerio.load(response.text);
			const rssLink = $(BRUNCH_SELECTORS.rssLink).attr('href');

			if (rssLink) {
				return rssLink.startsWith('http') ? rssLink : `${BRUNCH_BASE_URL}${rssLink}`;
			}
		} catch (error) {
			console.error('Failed to get RSS URL:', error);
		}

		return undefined;
	}

	/**
	 * Parse RSS feed and return items
	 */
	async parseRssFeed(rssUrl: string): Promise<BrunchRssItem[]> {
		const items: BrunchRssItem[] = [];

		try {
			const response = await requestUrl({
				url: rssUrl,
				method: 'GET',
				headers: {
					...BRUNCH_REQUEST_HEADERS,
					'Accept': 'application/rss+xml, application/xml, text/xml',
				}
			});

			const $ = cheerio.load(response.text, { xmlMode: true });

			$('item').each((_, item) => {
				const $item = $(item);
				items.push({
					title: $item.find('title').text(),
					link: $item.find('link').text(),
					pubDate: $item.find('pubDate').text(),
					author: $item.find('author').text(),
					guid: $item.find('guid').text(),
					description: $item.find('description').text(),
				});
			});

		} catch (error) {
			console.error('Failed to parse RSS feed:', error);
		}

		return items;
	}

	/**
	 * Delay helper for rate limiting
	 */
	private delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	/**
	 * Extract video ID from Kakao TV embed URL
	 */
	private extractKakaoVideoId(url: string): string | null {
		const match = url.match(KAKAO_VIDEO_ID_PATTERN);
		return match ? match[1] : null;
	}

	/**
	 * Get Kakao TV video info including MP4 download URL
	 */
	async getKakaoVideoInfo(videoId: string, refererUrl: string): Promise<BrunchVideo | null> {
		try {
			console.log('[Brunch] Fetching Kakao video info for:', videoId);

			// Step 1: Get auth token from readyNplay API
			// Build URL without @ symbol which causes issues
			const baseUrl = `https://play-tv.kakao.com/katz/v4/ft/cliplink/${videoId}`;
			const readyPlayUrl = `${baseUrl}@my/readyNplay` +
				`?player=monet_html5&referer=${encodeURIComponent(refererUrl)}` +
				`&profile=HIGH&service=daum_brunch&section=article` +
				`&fields=seekUrl,abrVideoLocationList&playerVersion=3.47.1&appVersion=143.0.0.0` +
				`&startPosition=0&dteType=PC&continuousPlay=false&autoPlay=false&drmType=widevine`;

			console.log('[Brunch] readyNplay URL:', readyPlayUrl);

			const readyPlayResponse = await requestUrl({
				url: readyPlayUrl,
				method: 'GET',
				headers: {
					'User-Agent': BRUNCH_REQUEST_HEADERS['User-Agent'],
					'Accept': '*/*',
					'Referer': 'https://play-tv.kakao.com/',
				},
				throw: false
			});

			if (readyPlayResponse.status !== 200) {
				console.log('[Brunch] readyNplay API failed:', readyPlayResponse.status);
				return null;
			}

			const readyPlayData = JSON.parse(readyPlayResponse.text);
			const token = readyPlayData?.kampLocation?.token;

			if (!token) {
				console.log('[Brunch] No auth token in readyNplay response');
				return null;
			}

			// Step 2: Get video streams from kamp API
			const kampUrl = KAKAO_KAMP_VOD_URL(videoId) +
				`?tid=${readyPlayData.tid || ''}&param_auth=true&${Date.now()}`;

			const kampResponse = await requestUrl({
				url: kampUrl,
				method: 'GET',
				headers: {
					'User-Agent': BRUNCH_REQUEST_HEADERS['User-Agent'],
					'Accept': '*/*',
					'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
					'Referer': 'https://play-tv.kakao.com/',
					'Origin': 'https://play-tv.kakao.com',
					'x-kamp-player': 'monet_html5',
					'x-kamp-auth': `Bearer ${token}`,
					'x-kamp-version': '3.47.1',
					'sec-ch-ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
					'sec-ch-ua-mobile': '?0',
					'sec-ch-ua-platform': '"macOS"',
					'sec-fetch-dest': 'empty',
					'sec-fetch-mode': 'cors',
					'sec-fetch-site': 'same-site',
				},
				throw: false
			});

			if (kampResponse.status !== 200) {
				console.log('[Brunch] kamp API failed:', kampResponse.status);
				return null;
			}

			const kampData = JSON.parse(kampResponse.text);

			// Check if DRM protected
			if (kampData.is_drm) {
				console.log('[Brunch] Video is DRM protected, cannot download');
				return {
					url: `https://play-tv.kakao.com/embed/player/cliplink/${videoId}@my`,
					type: 'kakaoTV',
					videoId,
					thumbnail: kampData.thumbnail,
				};
			}

			// Find best MP4 stream (prefer HIGH quality)
			const streams = kampData.streams || [];
			let mp4Stream = streams.find((s: { protocol: string; profile: string }) =>
				s.protocol === 'mp4' && s.profile === 'HIGH'
			);

			// Fallback to any MP4
			if (!mp4Stream) {
				mp4Stream = streams.find((s: { protocol: string }) => s.protocol === 'mp4');
			}

			// Find profile info
			const profiles = kampData.profiles || [];
			const highProfile = profiles.find((p: { name: string }) => p.name === 'HIGH');
			const duration = highProfile?.duration || kampData.duration;

			console.log('[Brunch] Found MP4 stream:', mp4Stream?.name, mp4Stream?.profile);

			return {
				url: `https://play-tv.kakao.com/embed/player/cliplink/${videoId}@my`,
				type: 'kakaoTV',
				videoId,
				mp4Url: mp4Stream?.url,
				thumbnail: kampData.thumbnail,
				duration: duration,
				profile: mp4Stream?.profile || 'HIGH',
			};

		} catch (error) {
			console.error('[Brunch] Failed to get Kakao video info:', error);
			return null;
		}
	}

	/**
	 * Static method to parse post URL and extract username and postId
	 */
	static parsePostUrl(url: string): { username: string; postId: string } | null {
		const match = url.match(BRUNCH_URL_PATTERNS.post);
		if (match) {
			return {
				username: match[1],
				postId: match[2],
			};
		}
		return null;
	}

	/**
	 * Static method to check if URL is a valid Brunch URL
	 */
	static isBrunchUrl(url: string): boolean {
		return url.includes('brunch.co.kr');
	}
}
