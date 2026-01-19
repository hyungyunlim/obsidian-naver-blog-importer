import { App, Notice, requestUrl, normalizePath } from 'obsidian';
import { NaverBlogSettings, DEFAULT_SETTINGS } from '../types';
import { NAVER_VIDEO_API_ENDPOINT } from '../constants/api-endpoints';

/**
 * Video metadata extracted from HTML content
 */
export interface VideoMetadata {
	vid: string;
	inkey: string;
	thumbnail: string;
	title?: string;
	elementId: string;
}

/**
 * Video quality option from API response
 */
export interface VideoQuality {
	id: string;
	name: string;  // e.g., "1080p", "720p", "480p", "270p"
	width: number;
	height: number;
	source: string;  // MP4 URL
	bitrate: number;
	duration: number;
}

/**
 * Service for downloading Naver videos from cafe/blog posts
 */
export class VideoService {
	constructor(
		private app: App,
		private settings: NaverBlogSettings
	) {}

	/**
	 * Extract video metadata from HTML content
	 * Parses __se_module_data script tags to find vid and inkey
	 */
	extractVideoMetadata(contentHtml: string): VideoMetadata[] {
		const videos: VideoMetadata[] = [];
		const seenVids = new Set<string>(); // 중복 방지용

		// Pattern to match __se_module_data with video information
		// Only match data-module-v2 to avoid duplicates (data-module and data-module-v2 contain same info)
		const moduleDataPattern = /data-module-v2='(\{[^']+\})'/g;
		let match;

		while ((match = moduleDataPattern.exec(contentHtml)) !== null) {
			try {
				let jsonStr = match[1];

				// Unescape if needed (some responses have escaped quotes)
				if (jsonStr.includes('\\"')) {
					jsonStr = jsonStr.replace(/\\"/g, '"');
				}

				const data = JSON.parse(jsonStr);

				// Check if this is a video module
				if (data.type !== 'v2_video') continue;

				if (data.data?.vid && data.data?.inkey) {
					// Skip if we've already seen this vid
					if (seenVids.has(data.data.vid)) continue;
					seenVids.add(data.data.vid);

					videos.push({
						vid: data.data.vid,
						inkey: data.data.inkey,
						thumbnail: data.data.thumbnail || '',
						title: data.data.mediaMeta?.title || '',
						elementId: data.id || ''
					});
				}
			} catch {
				// Skip malformed JSON
				continue;
			}
		}

		return videos;
	}

	/**
	 * Fetch video quality options from Naver API
	 */
	async fetchVideoQualities(vid: string, inkey: string): Promise<VideoQuality[]> {
		try {
			const apiUrl = NAVER_VIDEO_API_ENDPOINT(vid, inkey);

			const response = await requestUrl({
				url: apiUrl,
				method: 'GET',
				headers: {
					'Accept': '*/*',
					'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
				}
			});

			if (response.status !== 200) {
				throw new Error(`Video API returned status ${response.status}`);
			}

			const data = response.json;
			const qualities: VideoQuality[] = [];

			// Extract video list from response
			if (data.videos?.list) {
				for (const video of data.videos.list) {
					qualities.push({
						id: video.id,
						name: video.encodingOption?.name || 'unknown',
						width: video.encodingOption?.width || 0,
						height: video.encodingOption?.height || 0,
						source: video.source,
						bitrate: (video.bitrate?.video || 0) + (video.bitrate?.audio || 0),
						duration: video.duration || 0
					});
				}
			}

			// Sort by resolution (highest first)
			qualities.sort((a, b) => b.height - a.height);

			return qualities;
		} catch (error) {
			console.error('Failed to fetch video qualities:', error);
			throw error;
		}
	}

	/**
	 * Download video and save to vault
	 * @param videoUrl - Direct MP4 URL
	 * @param filename - Filename to save as
	 * @param customVideoFolder - Optional custom folder for videos
	 * @returns Path to saved video file
	 */
	async downloadVideo(
		videoUrl: string,
		filename: string,
		customVideoFolder?: string
	): Promise<string> {
		try {
			// Determine video folder (use image folder setting or custom)
			const videoFolder = normalizePath(
				customVideoFolder ||
				this.settings.imageFolder ||
				DEFAULT_SETTINGS.imageFolder
			);

			// Create folder if it doesn't exist
			const folderExists = this.app.vault.getAbstractFileByPath(videoFolder);
			if (!folderExists) {
				await this.app.vault.createFolder(videoFolder);
			}

			// Download video
			const response = await requestUrl({
				url: videoUrl,
				method: 'GET'
			});

			if (response.status !== 200 || !response.arrayBuffer) {
				throw new Error(`Failed to download video: status ${response.status}`);
			}

			// Sanitize filename
			const sanitizedFilename = this.sanitizeFilename(filename);
			const videoPath = normalizePath(`${videoFolder}/${sanitizedFilename}`);

			// Save video file
			await this.app.vault.createBinary(videoPath, response.arrayBuffer);

			return videoPath;
		} catch (error) {
			console.error('Failed to download video:', error);
			throw error;
		}
	}

	/**
	 * Process content and download all videos
	 * @param content - Markdown content
	 * @param contentHtml - Original HTML content (for video metadata extraction)
	 * @param articleId - Article/post ID for filename prefix
	 * @param customVideoFolder - Optional custom folder
	 * @param customNotesFolder - Optional notes folder for relative path calculation
	 * @returns Updated content with video placeholders replaced
	 */
	async downloadAndProcessVideos(
		content: string,
		contentHtml: string,
		articleId: string,
		customVideoFolder?: string,
		customNotesFolder?: string
	): Promise<string> {
		// Check if video download is enabled (use image download setting)
		if (!this.settings.enableImageDownload) {
			return content;
		}

		const videos = this.extractVideoMetadata(contentHtml);

		if (videos.length === 0) {
			return content;
		}

		let processedContent = content;
		let videoCount = 0;

		for (const video of videos) {
			try {
				new Notice(`Downloading video ${videoCount + 1}/${videos.length}...`, 3000);

				// Fetch available qualities
				const qualities = await this.fetchVideoQualities(video.vid, video.inkey);

				if (qualities.length === 0) {
					console.warn(`No video qualities found for vid: ${video.vid}`);
					continue;
				}

				// Select best quality (first in sorted list)
				const bestQuality = qualities[0];

				// Generate filename
				const extension = 'mp4';
				const title = video.title ? this.sanitizeFilename(video.title) : 'video';
				const filename = `${articleId}_${videoCount}_${title}_${bestQuality.name}.${extension}`;

				// Download video
				await this.downloadVideo(
					bestQuality.source,
					filename,
					customVideoFolder
				);

				// Calculate relative path
				const relativePath = this.calculateRelativePath(customNotesFolder, customVideoFolder);
				const relativeVideoPath = `${relativePath}${filename}`;

				// Create video embed markdown
				// Using Obsidian's embed syntax for videos
				const videoEmbed = `![[${relativeVideoPath}]]`;

				// Replace video placeholder in content
				// Look for <!--VIDEO:vid--> placeholder
				const videoPlaceholder = `<!--VIDEO:${video.vid}-->`;

				if (processedContent.includes(videoPlaceholder)) {
					processedContent = processedContent.replace(videoPlaceholder, videoEmbed);
				} else {
					// Fallback: try old [비디오] placeholder (for backwards compatibility)
					if (processedContent.includes('[비디오]')) {
						processedContent = processedContent.replace('[비디오]', videoEmbed);
					} else {
						// If no placeholder found, append video at the end
						processedContent += `\n\n${videoEmbed}`;
					}
				}

				videoCount++;
				new Notice(`Downloaded video: ${bestQuality.name} (${(bestQuality.bitrate / 1000).toFixed(1)} Mbps)`, 3000);

			} catch (error) {
				console.error(`Failed to download video ${video.vid}:`, error);
				new Notice(`Failed to download video: ${error.message}`, 5000);
			}

			// Small delay between downloads to avoid rate limiting
			await new Promise(resolve => setTimeout(resolve, 500));
		}

		if (videoCount > 0) {
			new Notice(`Downloaded ${videoCount} video(s)`, 4000);
		}

		return processedContent;
	}

	/**
	 * Sanitize filename for safe file system use
	 */
	private sanitizeFilename(filename: string): string {
		return filename
			.replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
			.replace(/\s+/g, '_')          // Replace spaces with underscores
			.replace(/_{2,}/g, '_')        // Remove consecutive underscores
			.substring(0, 100);            // Limit length
	}

	/**
	 * Calculate relative path from notes folder to video folder
	 */
	private calculateRelativePath(customNotesFolder?: string, customVideoFolder?: string): string {
		const notesFolder = normalizePath(
			customNotesFolder ||
			this.settings.defaultFolder ||
			DEFAULT_SETTINGS.defaultFolder
		);
		const videoFolder = normalizePath(
			customVideoFolder ||
			this.settings.imageFolder ||
			DEFAULT_SETTINGS.imageFolder
		);

		// Calculate relative path
		if (videoFolder.startsWith(notesFolder)) {
			const relativePath = videoFolder.substring(notesFolder.length + 1);
			return relativePath ? `${relativePath}/` : '';
		}

		// Video folder is outside notes folder
		const notesParts = notesFolder.split('/');
		const videoParts = videoFolder.split('/');

		let commonIndex = 0;
		while (
			commonIndex < notesParts.length &&
			commonIndex < videoParts.length &&
			notesParts[commonIndex] === videoParts[commonIndex]
		) {
			commonIndex++;
		}

		const upLevels = notesParts.length - commonIndex;
		const upPath = '../'.repeat(upLevels);
		const downPath = videoParts.slice(commonIndex).join('/');

		return upPath + (downPath ? `${downPath}/` : '');
	}

	/**
	 * Update settings
	 */
	updateSettings(newSettings: NaverBlogSettings): void {
		this.settings = newSettings;
	}
}
