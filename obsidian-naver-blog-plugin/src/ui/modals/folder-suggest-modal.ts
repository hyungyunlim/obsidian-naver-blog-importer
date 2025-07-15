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
			placeholder: 'Type to filter folders...',
			cls: 'naver-blog-folder-input'
		});

		const listEl = contentEl.createEl('div', { cls: 'naver-blog-folder-list' });

		const renderFolders = (filter: string = '') => {
			listEl.empty();
			
			const filteredFolders = this.folders.filter(folder => 
				folder.toLowerCase().includes(filter.toLowerCase())
			);

			for (const folder of filteredFolders) {
				const folderEl = listEl.createEl('div', {
					text: folder || '(Root)',
					cls: 'suggestion-item naver-blog-folder-item'
				});
				
				folderEl.addEventListener('click', () => {
					this.onChoose(folder);
					this.close();
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