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

	async downloadAndProcessImages(content: string, logNo: string): Promise<string> {
		if (!this.settings.enableImageDownload) {
			return content;
		}

		try {
			// Create attachments folder
			const attachmentsFolder = normalizePath(this.settings.imageFolder || DEFAULT_SETTINGS.imageFolder);
			const folderExists = this.app.vault.getAbstractFileByPath(attachmentsFolder);
			if (!folderExists) {
				await this.app.vault.createFolder(attachmentsFolder);
			}

			// Find all image markdown patterns - filter out unwanted images
			const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
			let processedContent = content;
			let imageCount = 0;
			const allMatches = [...content.matchAll(new RegExp(imageRegex.source, 'g'))];
			
			// Filter out unwanted images (GIFs, animations, editor assets)
			const filteredMatches = allMatches.filter(([_, altText, imageUrl]) => {
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
						
						// Update content with local path (relative to default folder)
						const relativePath = this.calculateRelativePath();
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
					const imageProgress = `(${imageCount + 1}/${totalImages})`;
					let directUrl = this.convertToDirectImageUrl(imageUrl);
					
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
								
								const relativePath = this.calculateRelativePath();
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
		} catch (error) {
			return content; // Return original content on error
		}
	}

	shouldDownloadImage(imageUrl: string, altText: string): boolean {
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
			'blogpfthumb-phinf.pstatic.net'
		];
		
		const isValidDomain = validDomains.some(domain => imageUrl.includes(domain));
		if (!isValidDomain && !imageUrl.match(/\.(jpg|jpeg|png|webp)(\?|$)/i)) {
			return false;
		}
		
		return true;
	}

	convertToDirectImageUrl(url: string): string {
		// Convert Naver blog image URLs to direct download URLs - improved logic
		let directUrl = url;
		
		// For postfiles.pstatic.net, keep the original URL but without query params
		if (directUrl.includes('postfiles.pstatic.net')) {
			// Remove only size-related query parameters, keep the URL structure
			directUrl = directUrl.replace(/\?type=w\d+/i, '').replace(/&type=w\d+/i, '');
			return directUrl;
		}
		
		// Remove query parameters for other domains
		directUrl = directUrl.split('?')[0];
		
		// Convert various Naver CDN formats to direct download URLs
		directUrl = directUrl
			.replace('https://mblogvideo-phinf.pstatic.net/', 'https://blogfiles.pstatic.net/') // video CDN
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

	private calculateRelativePath(): string {
		const defaultFolderPath = normalizePath(this.settings.defaultFolder || DEFAULT_SETTINGS.defaultFolder);
		const imageFolderPath = normalizePath(this.settings.imageFolder || DEFAULT_SETTINGS.imageFolder);
		
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