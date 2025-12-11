import { getLanguage } from 'obsidian';


export class LocaleUtils {
	
	/**
	 * Detects the user's locale using Obsidian's getLanguage() API
	 * @returns The detected locale code (e.g., 'ko', 'en')
	 */
	static detectLocale(): string {
		// Use Obsidian's official getLanguage() API
		const obsidianLang = getLanguage();
		if (obsidianLang) {
			return obsidianLang;
		}
		
		// Fallback to English if language is not detected
		return 'en';
	}
}