import { App, Modal } from 'obsidian';
import { UI_DEFAULTS } from '../../constants';

export class FolderSuggestModal extends Modal {
	folders: string[];
	onChoose: (folder: string) => void;
	
	constructor(app: App, folders: string[], onChoose: (folder: string) => void) {
		super(app);
		this.folders = folders;
		this.onChoose = onChoose;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h3', { text: 'Select Folder' });

		const inputEl = contentEl.createEl('input', {
			type: 'text',
			placeholder: 'Type to filter folders...'
		});
		inputEl.style.width = UI_DEFAULTS.modalInputWidth;
		inputEl.style.marginBottom = UI_DEFAULTS.modalInputMargin;

		const listEl = contentEl.createEl('div');
		listEl.style.maxHeight = '300px';
		listEl.style.overflowY = 'auto';

		const renderFolders = (filter: string = '') => {
			listEl.empty();
			
			const filteredFolders = this.folders.filter(folder => 
				folder.toLowerCase().includes(filter.toLowerCase())
			);

			for (const folder of filteredFolders) {
				const folderEl = listEl.createEl('div', {
					text: folder || '(Root)',
					cls: 'suggestion-item'
				});
				folderEl.style.padding = '8px';
				folderEl.style.cursor = 'pointer';
				folderEl.style.borderBottom = '1px solid var(--background-modifier-border)';
				
				folderEl.addEventListener('click', () => {
					this.onChoose(folder);
					this.close();
				});

				folderEl.addEventListener('mouseenter', () => {
					folderEl.style.backgroundColor = 'var(--background-modifier-hover)';
				});

				folderEl.addEventListener('mouseleave', () => {
					folderEl.style.backgroundColor = '';
				});
			}
		};

		inputEl.addEventListener('input', () => {
			renderFolders(inputEl.value);
		});

		// Initial render
		renderFolders();

		// Focus the input
		setTimeout(() => inputEl.focus(), UI_DEFAULTS.modalTimeout);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}