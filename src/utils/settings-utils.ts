import { NaverBlogSettings, DEFAULT_SETTINGS } from '../types';
import { MAX_POST_IMPORT_LIMIT } from '../constants';

export class SettingsUtils {
	
	/**
	 * Validates and normalizes plugin settings
	 * Ensures all settings have valid values and apply constraints
	 * @param settings The settings object to validate
	 * @returns Validated and normalized settings
	 */
	static validateAndNormalizeSettings(settings: NaverBlogSettings): NaverBlogSettings {
		const normalizedSettings = { ...settings };

		// Ensure default values are used if folders are empty
		if (!normalizedSettings.defaultFolder || normalizedSettings.defaultFolder.trim() === '') {
			normalizedSettings.defaultFolder = DEFAULT_SETTINGS.defaultFolder;
		}
		if (!normalizedSettings.imageFolder || normalizedSettings.imageFolder.trim() === '') {
			normalizedSettings.imageFolder = DEFAULT_SETTINGS.imageFolder;
		}

		// Validate postImportLimit
		if (normalizedSettings.postImportLimit < 0) {
			normalizedSettings.postImportLimit = DEFAULT_SETTINGS.postImportLimit;
		}
		if (normalizedSettings.postImportLimit > MAX_POST_IMPORT_LIMIT) {
			normalizedSettings.postImportLimit = MAX_POST_IMPORT_LIMIT; // Cap at max posts
		}

		// Ensure required arrays exist
		if (!normalizedSettings.subscribedBlogs) {
			normalizedSettings.subscribedBlogs = DEFAULT_SETTINGS.subscribedBlogs;
		}
		if (!normalizedSettings.blogSubscriptions) {
			normalizedSettings.blogSubscriptions = DEFAULT_SETTINGS.blogSubscriptions;
		}

		return normalizedSettings;
	}

	/**
	 * Validates if a folder path is acceptable
	 * @param folderPath The folder path to validate
	 * @returns True if the folder path is valid
	 */
	static isValidFolderPath(folderPath: string): boolean {
		if (!folderPath) return true; // Empty path is valid (uses default)
		
		// Check for invalid characters
		const invalidChars = /[<>:"|?*]/;
		if (invalidChars.test(folderPath)) {
			return false;
		}

		// Check for reserved names (Windows specific, but good to avoid)
		const reservedNames = ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9'];
		const pathParts = folderPath.split('/');
		for (const part of pathParts) {
			if (reservedNames.includes(part.toUpperCase())) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Validates if a post import limit is within acceptable range
	 * @param limit The limit to validate
	 * @returns Normalized limit within valid range
	 */
	static validatePostImportLimit(limit: number): number {
		if (isNaN(limit) || limit < 0) {
			return DEFAULT_SETTINGS.postImportLimit;
		}
		if (limit > MAX_POST_IMPORT_LIMIT) {
			return MAX_POST_IMPORT_LIMIT;
		}
		return limit;
	}

	/**
	 * Validates if an AI provider is supported
	 * @param provider The provider to validate
	 * @returns True if the provider is supported
	 */
	static isSupportedAIProvider(provider: string): provider is 'openai' | 'anthropic' | 'google' | 'ollama' {
		return ['openai', 'anthropic', 'google', 'ollama'].includes(provider);
	}

	/**
	 * Validates if an API key has the correct format for a provider
	 * @param provider The AI provider
	 * @param apiKey The API key to validate
	 * @returns True if the API key format is valid
	 */
	static isValidApiKeyFormat(provider: 'openai' | 'anthropic' | 'google' | 'ollama', apiKey: string): boolean {
		if (provider === 'ollama') {
			return true; // Ollama doesn't need API key
		}

		if (!apiKey || apiKey.trim() === '') {
			return false;
		}

		switch (provider) {
			case 'openai':
				return apiKey.startsWith('sk-');
			case 'anthropic':
				return apiKey.startsWith('sk-ant-');
			case 'google':
				return apiKey.startsWith('AIza');
			default:
				return true;
		}
	}

	/**
	 * Sanitizes a blog ID to ensure it's safe for use
	 * @param blogId The blog ID to sanitize
	 * @returns Sanitized blog ID
	 */
	static sanitizeBlogId(blogId: string): string {
		return blogId
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]/g, '') // Only allow alphanumeric, underscore, and hyphen
			.replace(/_{2,}/g, '_') // Replace multiple underscores with single
			.replace(/-{2,}/g, '-'); // Replace multiple hyphens with single
	}

	/**
	 * Validates if a blog ID is in valid format
	 * @param blogId The blog ID to validate
	 * @returns True if the blog ID is valid
	 */
	static isValidBlogId(blogId: string): boolean {
		if (!blogId || blogId.trim() === '') {
			return false;
		}

		// Check length (Naver blog IDs are typically 3-20 characters)
		const trimmed = blogId.trim();
		if (trimmed.length < 3 || trimmed.length > 20) {
			return false;
		}

		// Check format (alphanumeric, underscore, hyphen only)
		const validFormat = /^[a-zA-Z0-9_-]+$/;
		return validFormat.test(trimmed);
	}
}