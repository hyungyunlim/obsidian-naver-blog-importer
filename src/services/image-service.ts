import { App, Notice, requestUrl, normalizePath } from 'obsidian';
import { NaverBlogSettings, DEFAULT_SETTINGS } from '../types';
import { 
	MAX_FILENAME_LENGTH, 
	DEFAULT_IMAGE_EXTENSION, 
	SKIP_IMAGE_PATTERNS,
	SKIP_ALT_TEXT_PATTERNS,
	NAVER_CDN_PATTERNS,
	NAVER_PROFILE_IMAGE_PATH
} from '../constants';

export class ImageService {
	constructor(
		private app: App,
		private settings: NaverBlogSettings
	) {}

	async downloadAndProcessImages(content: string, logNo: string, customImageFolder?: string, customNotesFolder?: string): Promise<string> {
		// Always convert mblogvideo URLs to links (these are MP4 videos, not images)
		// This runs regardless of image download settings
		const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
		let processedContent = content;
		const allMatches = [...content.matchAll(new RegExp(imageRegex.source, 'g'))];

		for (const [fullMatch, altText, imageUrl] of allMatches) {
			if (imageUrl.includes('mblogvideo-phinf.pstatic.net')) {
				const linkText = altText || '동영상';
				const newLink = `[${linkText}](${imageUrl})`;
				processedContent = processedContent.replace(fullMatch, newLink);
			}
		}

		if (!this.settings.enableImageDownload) {
			return processedContent;
		}

		try {
			// Create attachments folder (use custom folder if provided, otherwise default)
			const attachmentsFolder = normalizePath(customImageFolder || this.settings.imageFolder || DEFAULT_SETTINGS.imageFolder);
			const folderExists = this.app.vault.getAbstractFileByPath(attachmentsFolder);
			if (!folderExists) {
				await this.app.vault.createFolder(attachmentsFolder);
			}

			let imageCount = 0;

			// Re-match after video conversion
			const remainingMatches = [...processedContent.matchAll(new RegExp(imageRegex.source, 'g'))];

			// Filter out unwanted images (GIFs, animations, editor assets)
			const filteredMatches = remainingMatches.filter(([_, altText, imageUrl]) => {
				return this.shouldDownloadImage(imageUrl, altText);
			});

			const totalImages = filteredMatches.length;

			// Found ${totalImages} valid images to download

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
					
					// Processing image ${imageProgress}
					new Notice(`Downloading image ${imageProgress} for post ${logNo}`, 2000);
					
					// Download image
					const response = await requestUrl({
						url: directUrl,
						method: 'GET'
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
						} catch {
							// Keep original filename if decoding fails
						}
						
						// If filename is too long or problematic, use a simpler name
						if (filename.length > MAX_FILENAME_LENGTH || !filename.includes('.')) {
							const extension = filename.match(/\.(jpg|jpeg|png|gif|webp)$/i)?.[1] || DEFAULT_IMAGE_EXTENSION;
							filename = `image_${Date.now()}.${extension}`;
						}
						
						// Add logNo prefix to avoid conflicts
						filename = `${logNo}_${imageCount}_${filename}`;
						filename = this.sanitizeFilename(filename);
						
						// Generated filename for image
						
						// Save image
						const imagePath = normalizePath(`${attachmentsFolder}/${filename}`);
							await this.app.vault.createBinary(imagePath, response.arrayBuffer);
							
							// Verify file was saved
							const fileExists = this.app.vault.getAbstractFileByPath(imagePath);
							// File saved successfully
							
							if (!fileExists) {
								throw new Error('File was not saved properly');
							}
						
						// Update content with local path (relative to notes folder)
						const relativePath = this.calculateRelativePath(customNotesFolder, customImageFolder);
						const localImagePath = `${relativePath}${filename}`;
						const newImageMd = `![${altText}](${localImagePath})`;
						
						// Clean the original image URL from query parameters before replacing
						processedContent = processedContent.replace(fullMatch, newImageMd);
						
						// Updated markdown with local image path
						
						imageCount++;
						// Downloaded image successfully
					} else {
						// Failed to download image - trying alternative method
					}
				} catch {
					// Try alternative download method for postfiles.pstatic.net
					if (imageUrl.includes('postfiles.pstatic.net')) {
						try {
							const altResponse = await requestUrl({
								url: imageUrl, // Use original URL
								method: 'GET'
							});
							
							if (altResponse.status === 200 && altResponse.arrayBuffer) {
								// Use same filename logic as above
								const urlParts = imageUrl.split('/');
								let filename = urlParts[urlParts.length - 1];
								filename = filename.split('?')[0];
								if (!filename.includes('.')) {
									filename += `.${DEFAULT_IMAGE_EXTENSION}`;
								}
								filename = `${logNo}_${imageCount}_${filename}`;
								filename = this.sanitizeFilename(filename);
								
								const imagePath = normalizePath(`${attachmentsFolder}/${filename}`);
								await this.app.vault.createBinary(imagePath, altResponse.arrayBuffer);

								const relativePath = this.calculateRelativePath(customNotesFolder, customImageFolder);
								const localImagePath = `${relativePath}${filename}`;
								const newImageMd = `![${altText}](${localImagePath})`;
								processedContent = processedContent.replace(fullMatch, newImageMd);
								imageCount++;
							}
						} catch {
							// Alternative download method failed, skip this image
						}
					}
				}
			}

			return processedContent;
		} catch {
			// Return original content on error
			return content;
		}
	}

	shouldDownloadImage(imageUrl: string, altText: string): boolean {
		// Skip Naver video CDN (these are MP4 videos, not images)
		if (imageUrl.includes('mblogvideo-phinf.pstatic.net')) {
			return false;
		}

		// Check URL patterns
		for (const pattern of SKIP_IMAGE_PATTERNS) {
			if (pattern.test(imageUrl)) {
				return false;
			}
		}
		
		// Check alt text patterns
		if (altText) {
			for (const pattern of SKIP_ALT_TEXT_PATTERNS) {
				if (pattern.test(altText)) {
					return false;
				}
			}
		}
		
		// Check if URL looks like a thumbnail (contains size parameters)
		const thumbnailPattern = /[?&](w|h|width|height)=\d+/i;
		if (thumbnailPattern.test(imageUrl)) {
			return false;
		}
		
		// Skip ssl.pstatic.net profile images specifically
		if (imageUrl.includes(NAVER_PROFILE_IMAGE_PATH)) {
			return false;
		}
		
		// Only download images from Naver CDN or direct image URLs
		const validDomains = [
			'blogfiles.pstatic.net',
			'postfiles.pstatic.net',
			'mblogthumb-phinf.pstatic.net',
			'blogpfthumb-phinf.pstatic.net',
			// Cafe image domains
			'cafeptthumb-phinf.pstatic.net',
			'cafefiles.pstatic.net',
			'cafe.pstatic.net',
			// Naver store/sticker images
			'storep-phinf.pstatic.net',
			// Naver News image domain
			'imgnews.pstatic.net',
		];
		
		const isValidDomain = validDomains.some(domain => imageUrl.includes(domain));
		if (!isValidDomain && !imageUrl.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/i)) {
			return false;
		}
		
		return true;
	}

	convertToDirectImageUrl(url: string): string {
		// Convert Naver blog image URLs to direct download URLs - improved logic
		let directUrl = url;

		// Handle dthumb-phinf.pstatic.net thumbnail proxy URLs (used in cafe scrap posts)
		// Format: https://dthumb-phinf.pstatic.net/?src=%22http%3A%2F%2Fpostfiles...%22&type=cafe_wa740
		if (directUrl.includes('dthumb-phinf.pstatic.net')) {
			try {
				const urlObj = new URL(directUrl);
				const srcParam = urlObj.searchParams.get('src');
				if (srcParam) {
					// Remove surrounding quotes (srcParam is already URL-decoded by searchParams.get)
					let extractedUrl = srcParam.replace(/^["']|["']$/g, '');
					// Convert http to https
					if (extractedUrl.startsWith('http://')) {
						extractedUrl = extractedUrl.replace('http://', 'https://');
					}
					directUrl = extractedUrl;
				}
			} catch {
				// If URL parsing fails, continue with original
			}
		}

		// For postfiles URLs (both pstatic.net and naver.net), use large size for full quality
		// Examples: postfiles.pstatic.net, postfiles3.naver.net, postfiles9.naver.net
		if (directUrl.includes('postfiles')) {
			// Replace small thumbnail type (w2, w80, etc.) with large size (w2000)
			// This returns the original/full-size image
			if (directUrl.includes('type=')) {
				directUrl = directUrl.replace(/type=w\d+/gi, 'type=w2000');
				directUrl = directUrl.replace(/type=cafe_wa\d+/gi, 'type=w2000');
			} else {
				// Add type parameter if not present
				directUrl += (directUrl.includes('?') ? '&' : '?') + 'type=w2000';
			}
			return directUrl;
		}

		// For storep-phinf.pstatic.net (Naver sticker/store images), add type parameter
		// These images require a type parameter to be accessible
		if (directUrl.includes('storep-phinf.pstatic.net')) {
			if (!directUrl.includes('type=')) {
				directUrl += (directUrl.includes('?') ? '&' : '?') + 'type=p100_100';
			}
			return directUrl;
		}

		// For imgnews.pstatic.net (Naver News images), convert to high resolution
		if (directUrl.includes('imgnews.pstatic.net')) {
			if (directUrl.includes('type=')) {
				directUrl = directUrl.replace(/type=w\d+/gi, 'type=w2000');
			} else {
				directUrl += (directUrl.includes('?') ? '&' : '?') + 'type=w2000';
			}
			return directUrl;
		}

		// Remove query parameters for other domains
		directUrl = directUrl.split('?')[0];

		// Convert various Naver CDN formats to direct download URLs
		directUrl = directUrl
			.replace('https://mblogthumb-phinf.pstatic.net/', 'https://blogfiles.pstatic.net/') // thumbnail CDN
			.replace('https://blogpfthumb-phinf.pstatic.net/', 'https://blogfiles.pstatic.net/') // profile thumb CDN
			.replace(NAVER_CDN_PATTERNS.year2018, '/MjAxOA==/')  // URL decode patterns
			.replace(NAVER_CDN_PATTERNS.year2019, '/MjAxOQ==/')
			.replace(NAVER_CDN_PATTERNS.year2020, '/MjAyMA==/')
			.replace(NAVER_CDN_PATTERNS.year2021, '/MjAyMQ==/')
			.replace(NAVER_CDN_PATTERNS.year2022, '/MjAyMg==/')
			.replace(NAVER_CDN_PATTERNS.year2023, '/MjAyMw==/')
			.replace(NAVER_CDN_PATTERNS.year2024, '/MjAyNA==/')
			.replace(NAVER_CDN_PATTERNS.year2025, '/MjAyNQ==/'); // 2025 added
		
		return directUrl;
	}

	sanitizeFilename(filename: string): string {
		return filename
			.replace(/\[.*?\]/g, '') // Remove [] brackets
			.replace(/[<>:"/\\|?*]/g, '') // Remove invalid characters
			.replace(/^\s+|\s+$/g, '') // Trim spaces
			.substring(0, MAX_FILENAME_LENGTH); // Limit length but keep spaces
	}

	private calculateRelativePath(customNotesFolder?: string, customImageFolder?: string): string {
		const defaultFolderPath = normalizePath(customNotesFolder || this.settings.defaultFolder || DEFAULT_SETTINGS.defaultFolder);
		const imageFolderPath = normalizePath(customImageFolder || this.settings.imageFolder || DEFAULT_SETTINGS.imageFolder);

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

		return relativePath;
	}

	// Helper method to update settings (for when settings change)
	updateSettings(newSettings: NaverBlogSettings) {
		this.settings = newSettings;
	}
}