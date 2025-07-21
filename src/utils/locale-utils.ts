import { App } from 'obsidian';
import { I18n } from './i18n';

export class LocaleUtils {
	
	/**
	 * Detects the user's locale using multiple fallback methods
	 * @returns The detected locale code (e.g., 'ko', 'en')
	 */
	static detectLocale(): string {
		// Primary: Use Obsidian's language setting (most reliable)
		const obsidianLang = window.localStorage.getItem('language');
		if (obsidianLang) {
			console.log('Detected Obsidian language:', obsidianLang);
			return obsidianLang;
		}
		
		// Fallback: Use moment.locale() (though unreliable in newer Obsidian versions)
		try {
			const momentLang = (window as any).moment?.locale();
			if (momentLang) {
				console.log('Detected moment language:', momentLang);
				return momentLang;
			}
		} catch (e) {
			// Ignore moment errors
		}
		
		// Final fallback: Use system locale
		if (navigator.language.startsWith('ko') || 
		    navigator.languages.some(lang => lang.startsWith('ko')) ||
		    Intl.DateTimeFormat().resolvedOptions().locale.startsWith('ko')) {
			console.log('Detected system language: ko');
			return 'ko';
		}
		
		console.log('Defaulting to language: en');
		return 'en';
	}

	/**
	 * Sets up a language change listener for dynamic locale switching
	 * @param app Obsidian app instance
	 * @param i18n I18n instance for reloading translations
	 * @param registerCleanup Function to register cleanup callbacks
	 */
	static setupLanguageChangeListener(
		app: App, 
		i18n: I18n, 
		registerCleanup: (cleanup: () => void) => void
	): void {
		// Listen for localStorage changes (when user changes language in Obsidian)
		const handleStorageChange = async (event: StorageEvent) => {
			if (event.key === 'language' && event.newValue !== event.oldValue) {
				console.log('Obsidian language changed to:', event.newValue);
				
				// Reload translations with new language
				const newLocale = event.newValue || 'en';
				await i18n.loadTranslations(newLocale);
				
				// Refresh UI elements if settings tab is open
				const settingsTab = (app as any).setting?.activeTab;
				if (settingsTab && settingsTab.id === 'naver-blog-importer') {
					// Refresh the settings display
					(settingsTab as any).display?.();
				}
			}
		};
		
		window.addEventListener('storage', handleStorageChange);
		
		// Clean up listener on unload
		registerCleanup(() => {
			window.removeEventListener('storage', handleStorageChange);
		});
	}
}