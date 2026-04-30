<script lang="ts">
	import { onMount } from 'svelte';
	import {
		availablePhotos,
		letterSections,
		photoTriggers,
		splitReadableText,
		type LetterSection,
		type PhotoTrigger,
		type PhotoChoice
	} from '$lib/listing-content';

	type EditableSection = Omit<LetterSection, 'paragraphs'> & { paragraphs: string[] };
	type EditablePhotoTrigger = PhotoTrigger;
	type LocalWriteCapability = {
		enabled: boolean;
		assetFolder: string;
		contentFile: string;
		sourceFolder?: string;
		sourceBrowserEnabled?: boolean;
	};
	type SourcePhoto = {
		name: string;
		relativePath: string;
		previewPath: string;
		modifiedAt?: string;
	};
	type SelectedWord = {
		sectionKey: string;
		paragraphIndex: number;
		tokenIndex: number;
	};
	type PhotoSearchMetadata = {
		searchTags?: readonly string[];
		description?: string;
	};
	type PhotoSearchMatch<T> = {
		item: T;
		label: string;
		description: string;
		searchTags: string[];
		matchedTerms: string[];
		score: number;
	};

	const localFileEndpoint = '/editor/__local-files';
	const semanticPhotoTags = {
		backyard: ['yard', 'garden', 'outdoor', 'outside', 'patio', 'deck', 'retreat', 'plants', 'trees', 'redwoods'],
		'hot tub': ['tub', 'spa', 'soak', 'relax', 'backyard', 'patio', 'stars'],
		cottage: ['guest house', 'in-law', 'back house', 'family', 'flexible', 'flex space', 'studio'],
		workshop: ['office', 'work from home', 'workspace', 'studio', 'barn doors', 'shop'],
		office: ['workshop', 'work from home', 'desk', 'workspace', 'studio'],
		garden: ['plants', 'plant map', 'landscape', 'yard', 'greenery', 'trees', 'flowers', 'avocado', 'lime', 'figs'],
		exterior: ['outside', 'front', 'entry', 'facade', 'street', 'porch', 'curb appeal'],
		kitchen: ['cooking', 'cook', 'sink', 'counter', 'cabinet', 'lime'],
		bedroom: ['bed', 'nursery', 'kid room', 'guest room', 'sleep'],
		light: ['bright', 'sun', 'sunlight', 'windows', 'morning', 'evening', 'golden hour'],
		patio: ['deck', 'outdoor', 'outside', 'backyard', 'barn doors', 'garden'],
		plants: ['garden', 'greenery', 'flowers', 'trees', 'avocado', 'makrut lime', 'figs', 'grapes', 'redwoods'],
		front: ['entry', 'exterior', 'street', 'porch', 'garden', 'curb appeal', 'front rooms'],
		deck: ['patio', 'outdoor', 'backyard', 'yard'],
		bath: ['bathroom', 'laundry', 'tub', 'clawfoot tub', 'soak'],
		map: ['plant map', 'garden', 'plants', 'landscape', 'annotation']
	} satisfies Record<string, readonly string[]>;
	const sourceFolderSearchHints = [
		{ pattern: 'exterior front entry', tags: ['front', 'exterior', 'entry', 'porch', 'garden', 'curb appeal'] },
		{ pattern: 'living dining common areas', tags: ['living', 'dining', 'front rooms', 'interior', 'light', 'windows'] },
		{ pattern: 'kitchen', tags: ['kitchen', 'cooking', 'cabinet', 'counter', 'sink'] },
		{ pattern: 'bedrooms', tags: ['bedroom', 'nursery', 'guest room', 'sleep', 'interior', 'light'] },
		{ pattern: 'bathrooms laundry', tags: ['bath', 'bathroom', 'laundry', 'tub', 'clawfoot tub'] },
		{ pattern: 'hallways stairs doors', tags: ['hallway', 'stairs', 'doors', 'interior', 'transition'] },
		{ pattern: 'outdoor backyard patio', tags: ['backyard', 'outdoor', 'patio', 'deck', 'garden', 'plants', 'hot tub'] }
	] satisfies readonly { pattern: string; tags: readonly string[] }[];

	let editedSections = $state<EditableSection[]>(
		letterSections.map((section) => ({ ...section, paragraphs: [...section.paragraphs] }))
	);
	let editedTriggers = $state<EditablePhotoTrigger[]>(photoTriggers.map((trigger) => ({ ...trigger })));
	let photoChoices = $state<PhotoChoice[]>(availablePhotos.map((photo) => ({ ...photo })));
	let activeTriggerKey = $state(editedTriggers[0]?.key ?? '');
	let selectedWord = $state<SelectedWord | null>(getWordFromTrigger(editedTriggers[0]));
	let newPhotoPath = $state('/listing/');
	let newPhotoLabel = $state('');
	let copyStatus = $state('');
	let saveStatus = $state('Checking local write endpoint…');
	let uploadStatus = $state('');
	let sourceBrowserStatus = $state('Source browser is available only on the local dev server.');
	let photoSearchQuery = $state('');
	let localWriteCapability = $state<LocalWriteCapability | null>(null);
	let sourcePhotos = $state<SourcePhoto[]>([]);
	let capabilityChecked = $state(false);
	let isSaving = $state(false);
	let isUploading = $state(false);
	let isLoadingSourcePhotos = $state(false);
	let importingSourcePath = $state('');
	let isDropActive = $state(false);

	const selectedTrigger = $derived(
		selectedWord
			? getTriggerAt(selectedWord.sectionKey, selectedWord.paragraphIndex, selectedWord.tokenIndex)
			: undefined
	);
	const directWriteAvailable = $derived(Boolean(localWriteCapability?.enabled));
	const exportSnippet = $derived(buildExportSnippet(photoChoices, editedSections, editedTriggers));
	const hasPhotoSearch = $derived(Boolean(photoSearchQuery.trim()));
	const photoChoiceSearchResults = $derived(searchPhotoChoices(photoChoices, editedTriggers, photoSearchQuery));
	const sourcePhotoSearchResults = $derived(searchSourcePhotos(sourcePhotos, photoSearchQuery));
	const totalPhotoSearchResults = $derived(photoChoiceSearchResults.length + sourcePhotoSearchResults.length);

	onMount(() => {
		void checkLocalWriteCapability();
		window.addEventListener('keydown', handleTriggerDeleteKey);

		return () => window.removeEventListener('keydown', handleTriggerDeleteKey);
	});

	function formatKey(key: string) {
		return key.replace(/-/g, ' ');
	}

	function getPhotoLabel(path: string) {
		return photoChoices.find((photo) => photo.path === path)?.label ?? path;
	}

	function getWordFromTrigger(trigger: EditablePhotoTrigger | undefined): SelectedWord | null {
		return trigger
			? {
					sectionKey: trigger.sectionKey,
					paragraphIndex: trigger.paragraphIndex,
					tokenIndex: trigger.tokenIndex
				}
			: null;
	}

	function selectTrigger(trigger: EditablePhotoTrigger) {
		activeTriggerKey = trigger.key;
		selectedWord = getWordFromTrigger(trigger);
	}

	function selectWord(section: EditableSection, paragraphIndex: number, tokenIndex: number) {
		selectedWord = { sectionKey: section.key, paragraphIndex, tokenIndex };
		activeTriggerKey = getTriggerAt(section.key, paragraphIndex, tokenIndex)?.key ?? '';
	}

	function matchesTriggerLocation(
		trigger: EditablePhotoTrigger,
		sectionKey: string,
		paragraphIndex: number,
		tokenIndex: number
	) {
		return (
			trigger.sectionKey === sectionKey &&
			trigger.paragraphIndex === paragraphIndex &&
			trigger.tokenIndex === tokenIndex
		);
	}

	function getTriggerAt(sectionKey: string, paragraphIndex: number, tokenIndex: number) {
		return editedTriggers.find((trigger) =>
			matchesTriggerLocation(trigger, sectionKey, paragraphIndex, tokenIndex)
		);
	}

	function getWordNumber(sectionKey: string, paragraphIndex: number, tokenIndex: number) {
		const section = editedSections.find((item) => item.key === sectionKey);
		const paragraph = section?.paragraphs[paragraphIndex] ?? '';
		return splitReadableText(paragraph)
			.slice(0, tokenIndex + 1)
			.filter((token) => token.trim()).length;
	}

	function countParagraphWords(paragraph: string) {
		return splitReadableText(paragraph).filter((token) => token.trim()).length;
	}

	function getThresholdWordNumber(sectionKey: string, paragraphIndex: number, tokenIndex: number) {
		let wordCount = 0;

		for (const section of editedSections) {
			for (const [currentParagraphIndex, paragraph] of section.paragraphs.entries()) {
				if (section.key === sectionKey && currentParagraphIndex === paragraphIndex) {
					return wordCount + getWordNumber(sectionKey, paragraphIndex, tokenIndex);
				}

				wordCount += countParagraphWords(paragraph);
			}
		}

		return wordCount;
	}

	function getWordToken(word: SelectedWord) {
		const section = editedSections.find((item) => item.key === word.sectionKey);
		const paragraph = section?.paragraphs[word.paragraphIndex] ?? '';
		return splitReadableText(paragraph)[word.tokenIndex]?.trim() ?? '';
	}

	function getWordContext(word: SelectedWord) {
		const section = editedSections.find((item) => item.key === word.sectionKey);
		const paragraph = section?.paragraphs[word.paragraphIndex] ?? '';
		const words = splitReadableText(paragraph).filter((token) => token.trim());
		const wordIndex = Math.max(getWordNumber(word.sectionKey, word.paragraphIndex, word.tokenIndex) - 1, 0);
		const start = Math.max(wordIndex - 6, 0);
		const end = Math.min(wordIndex + 7, words.length);
		return words.slice(start, end).join(' ');
	}

	function normalizeSearchText(value: string) {
		return value.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
	}

	function getSearchWords(value: string) {
		return normalizeSearchText(value).split(' ').filter((word) => word.length > 1);
	}

	function uniqueSearchTerms(values: readonly string[]) {
		return Array.from(new Set(values.map(normalizeSearchText).filter(Boolean)));
	}

	function getExpandedSearchTerms(query: string) {
		const normalizedQuery = normalizeSearchText(query);
		const terms = new Set(getSearchWords(query));
		if (normalizedQuery) terms.add(normalizedQuery);

		for (const [concept, aliases] of Object.entries(semanticPhotoTags)) {
			const relatedTerms = uniqueSearchTerms([concept, ...aliases]);
			const matchesConcept = relatedTerms.some((term) =>
				normalizedQuery.includes(term) || getSearchWords(term).some((word) => terms.has(word))
			);

			if (!matchesConcept) continue;
			for (const term of relatedTerms) {
				terms.add(term);
				for (const word of getSearchWords(term)) terms.add(word);
			}
		}

		return Array.from(terms);
	}

	function getInferredSearchTags(value: string) {
		const normalizedValue = normalizeSearchText(value);
		const tags = new Set<string>();

		for (const hint of sourceFolderSearchHints) {
			if (!normalizedValue.includes(normalizeSearchText(hint.pattern))) continue;
			for (const tag of hint.tags) tags.add(tag);
		}

		for (const [concept, aliases] of Object.entries(semanticPhotoTags)) {
			const relatedTerms = uniqueSearchTerms([concept, ...aliases]);
			if (!relatedTerms.some((term) => normalizedValue.includes(term))) continue;
			tags.add(concept);
			for (const alias of aliases) tags.add(alias);
		}

		return uniqueSearchTerms(Array.from(tags));
	}

	function scoreSearchText(searchText: string, query: string) {
		const normalizedSearchText = normalizeSearchText(searchText);
		const normalizedQuery = normalizeSearchText(query);
		const matchedTerms = new Set<string>();
		let score = 0;

		if (!normalizedQuery) return { score, matchedTerms: [] };
		if (normalizedSearchText.includes(normalizedQuery)) {
			score += 10;
			matchedTerms.add(normalizedQuery);
		}

		for (const term of getExpandedSearchTerms(query)) {
			if (term.length < 2 || !normalizedSearchText.includes(term)) continue;
			score += term.includes(' ') ? 4 : 2;
			matchedTerms.add(term);
		}

		return { score, matchedTerms: Array.from(matchedTerms).slice(0, 6) };
	}

	function titleizeSearchPart(value: string) {
		return value
			.replace(/\.[^.]+$/, '')
			.replace(/^[0-9]+[_-]?/, '')
			.replace(/[._-]+/g, ' ')
			.replace(/\b\w/g, (letter) => letter.toUpperCase())
			.trim();
	}

	function getSourcePhotoLabel(sourcePhoto: SourcePhoto) {
		const pathParts = sourcePhoto.relativePath.split(/[\\/]/);
		const folderLabel = pathParts.slice(0, -1).map(titleizeSearchPart).filter(Boolean).join(' · ');
		const fileLabel = titleizeSearchPart(sourcePhoto.name);
		return folderLabel ? `${folderLabel} · ${fileLabel}` : fileLabel;
	}

	function getSourcePhotoSearchMetadata(sourcePhoto: SourcePhoto): PhotoSearchMetadata {
		const label = getSourcePhotoLabel(sourcePhoto);
		const searchTags = getInferredSearchTags(`${sourcePhoto.relativePath} ${label}`);
		const folderLabel = label.includes(' · ') ? label.split(' · ')[0] : 'source folder';
		return {
			searchTags,
			description: `Local source photo from ${folderLabel}. Tags are inferred from the folder path and filename.`
		};
	}

	function getPhotoSearchMetadata(photo: PhotoChoice, triggers: EditablePhotoTrigger[]): PhotoSearchMetadata {
		const triggerText = triggers
			.filter((trigger) => trigger.image === photo.path)
			.map((trigger) => {
				const word = getWordFromTrigger(trigger);
				return `${trigger.key} ${trigger.sectionKey} ${trigger.imageLabel} ${word ? getWordContext(word) : ''}`;
			})
			.join(' ');
		const inferredTags = getInferredSearchTags(`${photo.path} ${photo.label} ${photo.description ?? ''} ${triggerText}`);

		return {
			searchTags: uniqueSearchTerms([...(photo.searchTags ?? []), ...inferredTags]),
			description: photo.description
		};
	}

	function buildSearchMatch<T>(
		item: T,
		label: string,
		description: string,
		searchTags: readonly string[],
		searchFields: readonly string[],
		query: string
	): PhotoSearchMatch<T> | null {
		const { score, matchedTerms } = scoreSearchText(searchFields.join(' '), query);
		if (query.trim() && !score) return null;
		return { item, label, description, searchTags: uniqueSearchTerms(searchTags), matchedTerms, score };
	}

	function sortSearchMatches<T>(matches: PhotoSearchMatch<T>[], query: string) {
		if (!query.trim()) return matches;
		return matches.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
	}

	function searchPhotoChoices(photos: PhotoChoice[], triggers: EditablePhotoTrigger[], query: string) {
		const matches = photos.flatMap((photo) => {
			const metadata = getPhotoSearchMetadata(photo, triggers);
			const relatedTriggerText = triggers
				.filter((trigger) => trigger.image === photo.path)
				.map((trigger) => `${trigger.key} ${trigger.sectionKey} ${trigger.imageLabel}`);
			const match = buildSearchMatch(
				photo,
				photo.label,
				metadata.description ?? '',
				metadata.searchTags ?? [],
				[photo.path, photo.label, metadata.description ?? '', ...(metadata.searchTags ?? []), ...relatedTriggerText],
				query
			);
			return match ? [match] : [];
		});

		return sortSearchMatches(matches, query);
	}

	function searchSourcePhotos(photos: SourcePhoto[], query: string) {
		const matches = photos.flatMap((sourcePhoto) => {
			const label = getSourcePhotoLabel(sourcePhoto);
			const metadata = getSourcePhotoSearchMetadata(sourcePhoto);
			const match = buildSearchMatch(
				sourcePhoto,
				label,
				metadata.description ?? '',
				metadata.searchTags ?? [],
				[sourcePhoto.name, sourcePhoto.relativePath, label, metadata.description ?? '', ...(metadata.searchTags ?? [])],
				query
			);
			return match ? [match] : [];
		});

		return sortSearchMatches(matches, query);
	}

	function getTriggerLocation(trigger: EditablePhotoTrigger) {
		return getWordLocation(trigger);
	}

	function getWordLocation(word: SelectedWord) {
		const wordNumber = getThresholdWordNumber(
			word.sectionKey,
			word.paragraphIndex,
			word.tokenIndex
		);
		const token = getWordToken(word) || 'missing word';

		return `Threshold word ${wordNumber}: “${token}”`;
	}

	function setTriggerImage(trigger: EditablePhotoTrigger, path: string) {
		trigger.image = path;
		trigger.imageLabel = getPhotoLabel(path);
		activeTriggerKey = trigger.key;
		selectedWord = getWordFromTrigger(trigger);
	}

	function assignPhotoToTrigger(trigger: EditablePhotoTrigger, path: string) {
		setTriggerImage(trigger, path);
		saveStatus = 'Trigger assignment changed. Save to source or copy the export snippet.';
	}

	function assignPhotoToSelectedWord(path: string) {
		if (!selectedWord) {
			saveStatus = 'Click a word in the letter before choosing a photo.';
			return;
		}

		const trigger = selectedTrigger ?? createTriggerAtSelectedWord(path);
		if (trigger) assignPhotoToTrigger(trigger, path);
	}

	function handleTriggerDeleteKey(event: KeyboardEvent) {
		if (!isTriggerRemovalKey(event) || isTextEditingTarget(event.target)) return;
		if (!selectedTrigger) {
			if (event.key === 'Backspace') event.preventDefault();
			return;
		}

		event.preventDefault();
		removeSelectedTrigger();
	}

	function isTriggerRemovalKey(event: KeyboardEvent) {
		return (event.key === 'Delete' || event.key === 'Backspace') && !event.altKey && !event.ctrlKey && !event.metaKey;
	}

	function isTextEditingTarget(target: EventTarget | null) {
		if (!(target instanceof Element)) return false;
		if (target.closest('input, textarea, select, search, [role="search"], [role="searchbox"]')) return true;

		const editable = target.closest('[contenteditable]');
		return editable instanceof HTMLElement && editable.isContentEditable;
	}

	function removeSelectedTrigger() {
		if (!selectedTrigger) return;

		const removedLabel = formatKey(selectedTrigger.key);
		const removedLocation = getTriggerLocation(selectedTrigger);
		const removedIndex = editedTriggers.findIndex((trigger) => trigger.key === selectedTrigger.key);
		if (removedIndex === -1) return;

		editedTriggers.splice(removedIndex, 1);
		activeTriggerKey = '';
		saveStatus = `Removed trigger “${removedLabel}” at ${removedLocation}. Save to source or copy the export snippet.`;
	}

	function createTriggerAtSelectedWord(path: string) {
		if (!selectedWord) return null;
		const existing = getTriggerAt(selectedWord.sectionKey, selectedWord.paragraphIndex, selectedWord.tokenIndex);
		if (existing) return existing;

		const trigger: EditablePhotoTrigger = {
			key: createTriggerKey(selectedWord),
			sectionKey: selectedWord.sectionKey,
			paragraphIndex: selectedWord.paragraphIndex,
			tokenIndex: selectedWord.tokenIndex,
			image: path,
			imageLabel: getPhotoLabel(path)
		};

		editedTriggers.push(trigger);
		sortTriggersByLocation();
		activeTriggerKey = trigger.key;
		return trigger;
	}

	function createTriggerKey(word: SelectedWord) {
		const base = slugify(`${word.sectionKey}-${getThresholdWordNumber(word.sectionKey, word.paragraphIndex, word.tokenIndex)}-${getWordToken(word)}`) || 'photo-trigger';
		let key = base;
		let suffix = 2;

		while (editedTriggers.some((trigger) => trigger.key === key)) {
			key = `${base}-${suffix}`;
			suffix += 1;
		}

		return key;
	}

	function slugify(value: string) {
		return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
	}

	function sortTriggersByLocation() {
		editedTriggers.sort((a, b) => {
			const sectionDelta = getSectionIndex(a.sectionKey) - getSectionIndex(b.sectionKey);
			if (sectionDelta) return sectionDelta;
			if (a.paragraphIndex !== b.paragraphIndex) return a.paragraphIndex - b.paragraphIndex;
			return a.tokenIndex - b.tokenIndex;
		});
	}

	function getSectionIndex(sectionKey: string) {
		const index = editedSections.findIndex((section) => section.key === sectionKey);
		return index === -1 ? Number.MAX_SAFE_INTEGER : index;
	}

	function isSelectedWord(sectionKey: string, paragraphIndex: number, tokenIndex: number) {
		return (
			selectedWord?.sectionKey === sectionKey &&
			selectedWord.paragraphIndex === paragraphIndex &&
			selectedWord.tokenIndex === tokenIndex
		);
	}

	function dropPhotoOnTriggerWord(
		event: DragEvent,
		section: EditableSection,
		paragraphIndex: number,
		tokenIndex: number
	) {
		event.preventDefault();
		const path =
			event.dataTransfer?.getData('application/x-listing-photo') ||
			event.dataTransfer?.getData('text/plain');

		if (!path) return;
		selectWord(section, paragraphIndex, tokenIndex);
		assignPhotoToSelectedWord(path);
	}

	function beginPhotoDrag(event: DragEvent, photo: PhotoChoice) {
		event.dataTransfer?.setData('text/plain', photo.path);
		event.dataTransfer?.setData('application/x-listing-photo', photo.path);
	}

	function mergePhotoSearchMetadata(photo: PhotoChoice, metadata: PhotoSearchMetadata) {
		const searchTags = uniqueSearchTerms([...(photo.searchTags ?? []), ...(metadata.searchTags ?? [])]);
		if (searchTags.length) photo.searchTags = searchTags;
		if (!photo.description && metadata.description) photo.description = metadata.description;
	}

	function addPhotoChoiceFrom(path: string, label: string, metadata: PhotoSearchMetadata = {}) {
		const trimmedPath = path.trim();
		if (!trimmedPath) return null;

		const existing = photoChoices.find((photo) => photo.path === trimmedPath);
		if (existing) {
			mergePhotoSearchMetadata(existing, metadata);
			return existing;
		}

		const photo: PhotoChoice = { path: trimmedPath, label: label.trim() || trimmedPath.split('/').pop() || trimmedPath };
		mergePhotoSearchMetadata(photo, {
			searchTags: [...getInferredSearchTags(`${trimmedPath} ${photo.label}`), ...(metadata.searchTags ?? [])],
			description: metadata.description
		});
		photoChoices.push(photo);
		return photo;
	}

	function addPhotoChoice() {
		const photo = addPhotoChoiceFrom(newPhotoPath, newPhotoLabel);
		if (!photo) return;

		newPhotoPath = '/listing/';
		newPhotoLabel = '';
		if (selectedWord) {
			assignPhotoToSelectedWord(photo.path);
		} else {
			saveStatus = `${photo.label} added to photo choices.`;
		}
	}

	async function loadSourcePhotos() {
		if (!directWriteAvailable) {
			sourcePhotos = [];
			sourceBrowserStatus = 'Source folder browsing is disabled outside the local dev server.';
			return;
		}

		isLoadingSourcePhotos = true;
		sourceBrowserStatus = `Loading images from ${localWriteCapability?.sourceFolder ?? 'source folder'}…`;

		try {
			const response = await fetch(`${localFileEndpoint}/source`, { cache: 'no-store' });
			if (!response.ok) throw new Error((await response.json()).message ?? 'Source folder unavailable.');
			const result = (await response.json()) as { sourceFolder: string; images: SourcePhoto[] };
			sourcePhotos = result.images;
			sourceBrowserStatus = result.images.length
				? `${result.images.length} source image${result.images.length === 1 ? '' : 's'} found in ${result.sourceFolder}.`
				: `No JPG, PNG, GIF, or WebP images found in ${result.sourceFolder}.`;
		} catch (error) {
			sourcePhotos = [];
			sourceBrowserStatus = error instanceof Error ? error.message : 'Could not load the source photo folder.';
		} finally {
			isLoadingSourcePhotos = false;
		}
	}

	async function importSourcePhoto(sourcePhoto: SourcePhoto) {
		if (!directWriteAvailable) {
			sourceBrowserStatus = 'Source imports are disabled outside the local dev server.';
			return;
		}

		importingSourcePath = sourcePhoto.relativePath;
		sourceBrowserStatus = `Importing ${sourcePhoto.name} into ${localWriteCapability?.assetFolder ?? 'static/listing'}…`;

		try {
			const response = await fetch(`${localFileEndpoint}/source-import`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ path: sourcePhoto.relativePath })
			});

			if (!response.ok) throw new Error((await response.json()).message ?? 'Source import failed.');
			const imported = (await response.json()) as PhotoChoice;
			const photo = addPhotoChoiceFrom(imported.path, imported.label, getSourcePhotoSearchMetadata(sourcePhoto));
			if (photo) assignPhotoToSelectedWord(photo.path);
			sourceBrowserStatus = `${imported.label} imported to ${imported.path}${selectedWord ? ` and assigned to ${getWordLocation(selectedWord)}` : '. Click a word to assign it'}.`;
		} catch (error) {
			sourceBrowserStatus = error instanceof Error ? error.message : 'Source import failed.';
		} finally {
			importingSourcePath = '';
		}
	}

	async function checkLocalWriteCapability() {
		try {
			const response = await fetch(localFileEndpoint, { cache: 'no-store' });
			if (!response.ok) throw new Error('No local write endpoint.');
			localWriteCapability = (await response.json()) as LocalWriteCapability;
			saveStatus = `Local writes enabled: ${localWriteCapability.contentFile}`;
			await loadSourcePhotos();
		} catch {
			localWriteCapability = null;
			sourcePhotos = [];
			sourceBrowserStatus = 'Source folder browsing is unavailable in static output. Use image drops, manual paths, or the export fallback.';
			saveStatus = 'Direct local writes are unavailable in static output. Use the export fallback.';
		} finally {
			capabilityChecked = true;
		}
	}

	async function uploadFiles(fileList: FileList | File[] | null) {
		const files = Array.from(fileList ?? []).filter((file) => file.type.startsWith('image/'));
		if (!files.length) return;

		if (!directWriteAvailable) {
			uploadStatus = 'Image drops are disabled without the local dev write endpoint.';
			return;
		}

		if (!selectedWord) {
			uploadStatus = 'Click a word in the letter before uploading a photo.';
			return;
		}

		isUploading = true;
		uploadStatus = `Uploading ${files.length} image${files.length === 1 ? '' : 's'}…`;

		try {
			for (const file of files) {
				const response = await fetch(
					`${localFileEndpoint}/upload?name=${encodeURIComponent(file.name || 'dropped-image')}`,
					{
						method: 'POST',
						headers: { 'Content-Type': file.type || 'application/octet-stream' },
						body: file
					}
				);

				if (!response.ok) throw new Error((await response.json()).message ?? 'Upload failed.');
				const uploaded = (await response.json()) as PhotoChoice & { fileName?: string };
				const photo = addPhotoChoiceFrom(uploaded.path, uploaded.label, {
					searchTags: getInferredSearchTags(`${uploaded.path} ${uploaded.label} ${uploaded.fileName ?? ''}`)
				});
				if (photo) assignPhotoToSelectedWord(photo.path);
			}

			uploadStatus = `Uploaded ${files.length} image${files.length === 1 ? '' : 's'} to static/listing.`;
		} catch (error) {
			uploadStatus = error instanceof Error ? error.message : 'Image upload failed.';
		} finally {
			isUploading = false;
			isDropActive = false;
		}
	}

	async function handleEditorDrop(event: DragEvent) {
		event.preventDefault();
		isDropActive = false;
		await uploadFiles(event.dataTransfer?.files ?? null);
	}

	async function handleFilePick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		await uploadFiles(input.files);
		input.value = '';
	}

	async function saveToSource() {
		if (!directWriteAvailable) {
			saveStatus = 'Direct writes are disabled here. Copy the export snippet instead.';
			return;
		}

		isSaving = true;
		saveStatus = 'Writing src/lib/listing-content.ts…';

		try {
			const response = await fetch(`${localFileEndpoint}/content`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ photos: photoChoices, sections: editedSections, triggers: editedTriggers })
			});

			if (!response.ok) throw new Error((await response.json()).message ?? 'Save failed.');
			const result = (await response.json()) as { contentFile: string };
			saveStatus = `Saved assignments to ${result.contentFile}.`;
		} catch (error) {
			saveStatus = error instanceof Error ? error.message : 'Could not save source file.';
		} finally {
			isSaving = false;
		}
	}

	function toTsArray(value: unknown) {
		return JSON.stringify(value, null, '\t').replace(/"([^"\\]+)":/g, '$1:');
	}

	function buildExportSnippet(
		photos: PhotoChoice[],
		sections: EditableSection[],
		triggers: EditablePhotoTrigger[]
	) {
		return `export const availablePhotos = ${toTsArray(photos)} as const satisfies readonly PhotoChoice[];\n\nexport const letterSections = ${toTsArray(sections)} as const satisfies readonly LetterSection[];\n\nexport const photoTriggers = ${toTsArray(triggers)} as const satisfies readonly PhotoTrigger[];`;
	}

	async function copySnippet() {
		copyStatus = '';
		try {
			await navigator.clipboard.writeText(exportSnippet);
			copyStatus = 'Copied config snippet.';
		} catch {
			copyStatus = 'Copy failed. Select the snippet and copy it manually.';
		}
	}
</script>

<svelte:head>
	<title>Photo editor sandbox</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="editor-shell">
	<section class="editor-grid" aria-label="Photo mapping editor">
		<div class="placement-panel">
			<section class="direct-write-card" aria-label="Local source writing state">
				<div>
					<h2>Direct source writes</h2>
					<p>{saveStatus}</p>
				</div>
				<button type="button" onclick={saveToSource} disabled={!directWriteAvailable || isSaving}>
					{isSaving ? 'Saving…' : directWriteAvailable ? 'Save to source' : capabilityChecked ? 'Static fallback only' : 'Checking…'}
				</button>
			</section>

				<details class="trigger-picker" aria-label="Existing photo triggers">
					<summary>
						<span>Existing trigger shortcuts</span>
						<small>Optional: jump to a numbered word</small>
					</summary>

				<div class="trigger-grid">
					{#each editedTriggers as trigger, index}
						<button
							type="button"
							class="trigger-chip"
							class:active-chip={trigger.key === activeTriggerKey}
							onclick={() => selectTrigger(trigger)}
						>
							<span>{index + 1}</span>
							<img src={trigger.image} alt="" draggable="false" />
							<strong>{formatKey(trigger.key)}</strong>
						</button>
					{/each}
				</div>
				</details>

			<section class="letter-text-card" aria-label="Place photo triggers in the continuous letter text">
				<div class="section-heading">
					<div>
							<p class="eyebrow">Step 1</p>
							<h2>Click a word in the letter</h2>
					</div>
						<p>Numbered words already have photo triggers. Any selected word can receive a photo.</p>
				</div>

				<div class="letter-flow">
					{#each editedSections as section}
						{#each section.paragraphs as paragraph, paragraphIndex}
							<p>
								{#each splitReadableText(paragraph) as token, tokenIndex}
									{@const trigger = getTriggerAt(section.key, paragraphIndex, tokenIndex)}
									{#if token.trim()}
										<button
											type="button"
											class="letter-word"
											class:has-trigger={Boolean(trigger)}
										class:active-word={trigger?.key === activeTriggerKey}
										class:selected-word={isSelectedWord(section.key, paragraphIndex, tokenIndex)}
										title={trigger ? `${trigger.key}: ${getTriggerLocation(trigger)}` : 'Select this word and choose a photo'}
										onclick={() => selectWord(section, paragraphIndex, tokenIndex)}
											ondragover={(event) => event.preventDefault()}
											ondrop={(event) => dropPhotoOnTriggerWord(event, section, paragraphIndex, tokenIndex)}
										>
											{token}{#if trigger}<span>{editedTriggers.findIndex((item) => item.key === trigger.key) + 1}</span>{/if}
										</button>
									{:else}{token}{/if}
								{/each}
							</p>
						{/each}
					{/each}
				</div>
			</section>
		</div>

			<aside class="preview-panel" aria-label="Selected word and photo choices">
				<section class="detail-card selected-word-card" aria-label="Selected word detail">
					<div class="section-heading">
						<div>
							<p class="eyebrow">Step 2</p>
							<h2>{selectedWord ? `Choose a photo for “${getWordToken(selectedWord)}”` : 'Choose a word first'}</h2>
						</div>
					</div>

					{#if selectedWord}
						<div class="location-card">
							<p class="trigger-location">{getWordLocation(selectedWord)}</p>
							<p>Nearby text: “{getWordContext(selectedWord)}”</p>
							<p>
								{selectedTrigger
									? `Editing existing trigger “${formatKey(selectedTrigger.key)}”.`
									: 'No trigger yet. Choosing a photo creates a new trigger here.'}
							</p>
						</div>

						{#if selectedTrigger}
							<figure class="preview-photo">
								<img src={selectedTrigger.image} alt={selectedTrigger.imageLabel} />
								<figcaption>{selectedTrigger.imageLabel} · {selectedTrigger.image}</figcaption>
							</figure>

							<label>
								Photo
								<select
									value={selectedTrigger.image}
									onchange={(event) => assignPhotoToTrigger(selectedTrigger, event.currentTarget.value)}
								>
									{#each photoChoices as photo}
										<option value={photo.path}>{photo.label}</option>
									{/each}
								</select>
							</label>

							<label>
								Path
								<input
									value={selectedTrigger.image}
									oninput={(event) => {
										selectedTrigger.image = event.currentTarget.value;
										activeTriggerKey = selectedTrigger.key;
										saveStatus = 'Trigger image path changed. Save to source or copy the export snippet.';
									}}
								/>
							</label>

							<label>
								Alt text
								<input bind:value={selectedTrigger.imageLabel} />
							</label>
						{/if}
					{:else}
						<p>Click a word in the letter to select where the next photo trigger should live.</p>
					{/if}
				</section>

			<section class="photo-search-card" aria-label="Semantic photo search">
				<div>
					<p class="eyebrow">Photo search</p>
					<h2>Find photos by meaning</h2>
				</div>
				<label class="search-field">
					Search bundled + Documents/web photos
					<input
						bind:value={photoSearchQuery}
						placeholder="Try backyard, hot tub, cottage, office, kitchen, light, plants…"
						aria-label="Search bundled and source-folder photos"
					/>
				</label>
				<p>
					Uses labels, paths, filename/folder words, trigger context, and curated house tags. This is
					semantic tag search, not an external AI vision service.
				</p>
				{#if hasPhotoSearch}
					<div class="search-summary">
						<strong>{totalPhotoSearchResults}</strong>
						<span>matching photo{totalPhotoSearchResults === 1 ? '' : 's'}</span>
						<button type="button" class="secondary-button" onclick={() => (photoSearchQuery = '')}>Clear</button>
					</div>
				{/if}
				<div class="search-examples" aria-label="Example searches">
					{#each ['backyard', 'hot tub', 'cottage', 'office', 'kitchen', 'bedroom', 'plants'] as example}
						<button type="button" onclick={() => (photoSearchQuery = example)}>{example}</button>
					{/each}
				</div>
			</section>

				<section class="source-browser" aria-label="Source photo folder browser">
					<div class="section-heading">
						<div>
							<p class="eyebrow">Local source folder</p>
							<h2>Import from Documents/web</h2>
						</div>
						<button type="button" class="secondary-button" onclick={loadSourcePhotos} disabled={!directWriteAvailable || isLoadingSourcePhotos}>
							{isLoadingSourcePhotos ? 'Loading…' : 'Refresh'}
						</button>
					</div>
					<p>{sourceBrowserStatus}</p>

				{#if sourcePhotoSearchResults.length}
						<div class="source-photo-grid">
						{#each sourcePhotoSearchResults as result (result.item.relativePath)}
							{@const sourcePhoto = result.item}
								<button
										type="button"
										onclick={() => importSourcePhoto(sourcePhoto)}
										disabled={!directWriteAvailable || !selectedWord || Boolean(importingSourcePath)}>
									<img src={sourcePhoto.previewPath} alt="" loading="lazy" />
								<!-- <figcaption title={sourcePhoto.relativePath}>
									<strong>{result.label}</strong>
									{#if hasPhotoSearch && result.matchedTerms.length}
										<span>Matched {result.matchedTerms.join(', ')}</span>
									{/if}
								</figcaption> -->
							</button>
							{/each}
						</div>
				{:else if hasPhotoSearch && sourcePhotos.length}
					<p class="status-text">No source-folder photos match “{photoSearchQuery}”.</p>
					{/if}
				</section>

				<section
					class="drop-zone"
					class:drop-active={isDropActive}
					class:disabled-zone={!directWriteAvailable || !selectedWord}
					aria-label="Drop image files"
					ondragenter={(event) => {
						event.preventDefault();
						isDropActive = directWriteAvailable && Boolean(selectedWord);
					}}
					ondragover={(event) => event.preventDefault()}
					ondragleave={() => (isDropActive = false)}
					ondrop={handleEditorDrop}
				>
					<h2>Drop image files</h2>
					<p>
						{directWriteAvailable
							? selectedWord
								? `Images are written to ${localWriteCapability?.assetFolder ?? 'static/listing'} and assigned to the selected word.`
								: 'Click a word first, then drop or choose an image.'
							: 'Disabled outside the local dev server. Add a path manually and copy the export instead.'}
					</p>
					<label class="file-picker">
						Choose images
						<input
							class="file-input"
							type="file"
							accept="image/*"
							multiple
							disabled={!directWriteAvailable || !selectedWord || isUploading}
							onchange={handleFilePick}
						/>
					</label>
					{#if uploadStatus}<p class="status-text">{uploadStatus}</p>{/if}
				</section>

				<section class="photo-library" aria-label="Photo choices">
					<p>Choose a bundled photo to create or update the trigger at the selected word.</p>
				{#if photoChoiceSearchResults.length}
					<div>
						{#each photoChoiceSearchResults as result (result.item.path)}
							{@const photo = result.item}
							<figure draggable="true" ondragstart={(event) => beginPhotoDrag(event, photo)}>
								<img src={photo.path} alt="" />
								<button type="button" onclick={() => assignPhotoToSelectedWord(photo.path)} disabled={!selectedWord}>
									{selectedWord ? 'Use for selected word' : 'Click a word first'}
								</button>
								<figcaption>
									<strong>{photo.label}</strong>
									{#if result.description}<span>{result.description}</span>{/if}
									{#if hasPhotoSearch && result.matchedTerms.length}
										<span>Matched {result.matchedTerms.join(', ')}</span>
									{/if}
								</figcaption>
							</figure>
						{/each}
					</div>
				{:else}
					<p class="status-text">No bundled photos match “{photoSearchQuery}”.</p>
				{/if}
				</section>

				<section class="add-photo" aria-label="Register another static photo path">
					<h2>Add a photo path</h2>
					<p>Use this fallback for already-copied files or static builds without direct writes.</p>
					<label>
						Path
						<input bind:value={newPhotoPath} placeholder="/listing/new-photo.jpg" />
					</label>
					<label>
						Friendly label
						<input bind:value={newPhotoLabel} placeholder="Kitchen morning light" />
					</label>
					<button type="button" onclick={addPhotoChoice}>
						{selectedWord ? 'Add and use for selected word' : 'Add to choices'}
					</button>
				</section>

				<details class="export-box">
					<summary>Export fallback</summary>
					<div>
						<p>
							Fallback for static builds: paste this over the exports in
							<code>src/lib/listing-content.ts</code>.
						</p>
						<button type="button" onclick={copySnippet}>Copy snippet</button>
					</div>
					{#if copyStatus}<p class="status-text">{copyStatus}</p>{/if}
					<textarea readonly value={exportSnippet}></textarea>
				</details>
		</aside>
	</section>
</main>

<style>
	.editor-shell {
		height: 100vh;
		overflow: hidden;
		
		/* padding: clamp(1rem, 3vw, 2.5rem); */
		background: #f7f3ec;
		color: #2d2924;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
	}

	.editor-grid {
		width: 100%;
	}

	h2,
	p {
		margin: 0;
	}

	h2 {
		font-size: 0.92rem;
		letter-spacing: 0.12em;
		text-transform: uppercase;
	}

		.editor-header p:not(.eyebrow),
	.detail-card p,
	.direct-write-card p,
	.drop-zone p,
		.add-photo p,
		.source-browser p,
		.photo-search-card p,
	.photo-library p,
	.export-box p,
	.letter-text-card > .section-heading > p {
		color: #6f675e;
		line-height: 1.5;
	}

	.eyebrow {
		margin-block-end: 0.7rem;
		font-size: 0.75rem;
		letter-spacing: 0.24em;
		text-transform: uppercase;
		color: #8f8375;
	}

	.editor-grid {
		display: grid;
		grid-template-columns: 1fr 2fr;
		gap: 1rem;
		align-items: start;
	}

		.placement-panel,
		.preview-panel,
		.detail-card {
		display: grid;
		gap: 1rem;
	}

	.placement-panel,
	.preview-panel {
		position: sticky;
		top: 1rem;
		align-self: start;
		align-content: start;
		max-height: 100vh;
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-gutter: stable;
		padding: 1rem;
	}

	.trigger-picker,
	.detail-card,
	.direct-write-card,
	.drop-zone,
		.add-photo,
		.source-browser,
		.photo-search-card,
		.photo-library,
	.export-box,
	.letter-text-card {
		padding: 1rem;
		border: 1px solid #ded5c8;
		border-radius: 1.25rem;
		background: #fffdf8;
		box-shadow: 0 1rem 2.8rem rgb(45 41 36 / 0.06);
	}

	.direct-write-card,
	.section-heading,
	.export-box > div {
		display: flex;
		gap: 1rem;
		align-items: center;
		justify-content: space-between;
	}

		.trigger-picker summary {
			display: flex;
			gap: 0.7rem;
			align-items: center;
			justify-content: space-between;
			cursor: pointer;
			font-weight: 800;
			letter-spacing: 0.08em;
			text-transform: uppercase;
		}

		.trigger-picker small {
			font-size: 0.72rem;
			font-weight: 700;
			letter-spacing: 0;
			text-transform: none;
			color: #8f8375;
		}

	.trigger-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 0.6rem;
		margin-block-start: 0.85rem;
	}

	.trigger-chip {
		display: grid;
		grid-template-columns: auto 2.8rem minmax(0, 1fr);
		gap: 0.6rem;
		align-items: center;
		padding: 0.55rem;
		border: 1px solid #ded5c8;
		/* border-radius: 0.9rem; */
		background: #fffdf8;
		color: #2d2924;
		text-align: left;
	}

	.trigger-chip span {
		width: 1.45rem;
		height: 1.45rem;
		display: grid;
		place-items: center;
		/* border-radius: 999px; */
		background: #2d2924;
		color: #fffdf8;
		font-size: 0.72rem;
		font-weight: 800;
	}

	.trigger-chip img {
		width: 2.8rem;
		aspect-ratio: 1;
		object-fit: cover;
		/* border-radius: 0.65rem; */
		background: #e9e0d5;
	}

	.trigger-chip strong {
		font-family: Georgia, 'Times New Roman', serif;
		font-size: 1.02rem;
		text-transform: capitalize;
	}

	.trigger-chip.active-chip,
	.drop-zone.drop-active {
		border-color: #9c7455;
		background: #fff8ec;
	}

	.photo-library img,
	.source-browser img {
		width: 100%;
		aspect-ratio: 16 / 9;
		object-fit: cover;
		/* border-radius: 0.9rem; */
		background: #e9e0d5;
	}

	label {
		display: grid;
		gap: 0.4rem;
		margin-block: 0.75rem;
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: #7a7065;
	}

	input,
	select,
	textarea {
		width: 100%;
		border: 1px solid #d7cdbf;
		border-radius: 0.75rem;
		padding: 0.75rem 0.85rem;
		background: #fff;
		color: #2d2924;
		font: inherit;
	}

	button,
	.file-picker {
		/* border: 0;
		border-radius: 999px;
		padding: 0.72rem 1rem;
		background: #2d2924;
		color: #fffdf8;
		font-weight: 700;
		cursor: pointer; */
	}

		.secondary-button,
	.source-browser button,
	.photo-library button {
		background: #efe8dd;
		color: #2d2924;
	}

	.letter-text-card {
		display: grid;
		gap: 1rem;
	}

	.letter-flow {
		display: block;
		font-family: Georgia, 'Times New Roman', serif;
		font-size: 1.08rem;
		line-height: 1.75;
		letter-spacing: -0.01em;
	}

	.letter-flow p + p {
		margin-block-start: 1.05rem;
	}

	.letter-word {
		position: relative;
		display: inline;
		padding: 0.05rem 0.1rem;
		border-radius: 0.25rem;
		background: transparent;
		color: inherit;
		font: inherit;
		font-weight: inherit;
		letter-spacing: inherit;
		text-align: inherit;
	}

	.letter-word.has-trigger {
		background: #efe1ce;
		box-shadow: 0 0 0 1px #c69b75 inset;
	}

		.letter-word.active-word,
		.letter-word.selected-word {
		background: #2d2924;
		color: #fffdf8;
	}

		.letter-word.selected-word {
			box-shadow: 0 0 0 0.18rem rgb(156 116 85 / 0.34);
		}

		.letter-word.selected-word span {
			background: #fffdf8;
			color: #2d2924;
		}

	.letter-word span {
		position: relative;
		top: -0.45em;
		display: inline-grid;
		place-items: center;
		min-width: 1.1rem;
		height: 1.1rem;
		margin-inline-start: 0.1rem;
		border-radius: 999px;
		background: #9c7455;
		color: #fffdf8;
		font-family: Inter, ui-sans-serif, system-ui, sans-serif;
		font-size: 0.62rem;
		line-height: 1;
	}

	.trigger-location {
		font-weight: 700;
		color: #7a5134 !important;
	}

	button:disabled,
	.file-picker:has(input:disabled) {
		cursor: not-allowed;
		opacity: 0.48;
	}

	.preview-photo {
		margin: 0;
	}

	.preview-photo img {
		width: 100%;
		min-height: min(44vh, 420px);
		object-fit: cover;
		border-radius: 1.25rem;
		background: #e9e0d5;
	}

	.location-card {
		display: grid;
		gap: 0.35rem;
		padding: 0.85rem;
		border-radius: 1rem;
		background: #fbf7ef;
	}

	figcaption {
		margin-block-start: 0.5rem;
		font-size: 0.85rem;
		color: #6f675e;
	}

	.drop-zone,
	.add-photo,
		.source-browser,
		.photo-search-card,
	.photo-library,
	.export-box {
		display: grid;
		gap: 0.85rem;
	}

		.photo-search-card {
			border-color: #c69b75;
			background: linear-gradient(135deg, #fffdf8, #fff7ea);
		}

		.search-field input {
			padding: 0.95rem 1rem;
			border-color: #b98d68;
			font-size: 1rem;
			box-shadow: 0 0 0 0.2rem rgb(156 116 85 / 0.1);
		}

		.search-summary,
		.search-examples {
			display: flex;
			flex-wrap: wrap;
			gap: 0.45rem;
			align-items: center;
		}

		.search-summary {
			padding: 0.65rem;
			border-radius: 0.85rem;
			background: #fbf0e2;
		}

		.search-summary strong {
			font-size: 1.4rem;
			line-height: 1;
		}

		.search-examples button {
			padding: 0.45rem 0.7rem;
			background: #efe8dd;
			color: #2d2924;
			font-size: 0.82rem;
		}

	.drop-zone {
		border-style: dashed;
	}

	.drop-zone.disabled-zone {
		background: #fbf7ef;
	}

	.file-picker {
		display: inline-grid;
		justify-self: start;
		margin: 0;
		letter-spacing: 0;
		text-transform: none;
	}

	.file-input {
		position: absolute;
		inline-size: 1px;
		block-size: 1px;
		opacity: 0;
		pointer-events: none;
	}

		.photo-library > div,
		.source-photo-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.75rem;
	}

		.photo-library figure,
		.source-browser figure {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		}

		.photo-library figure {
		cursor: grab;
	}

		.source-browser figcaption,
		.photo-library figcaption {
			display: grid;
			gap: 0.25rem;
		}

		.source-browser figcaption strong,
		.photo-library figcaption strong {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
		}

		.source-browser figcaption span,
		.photo-library figcaption span {
			font-size: 0.78rem;
			line-height: 1.35;
			color: #8f8375;
		}

	.photo-library figure:active {
		cursor: grabbing;
	}

	.export-box textarea {
		min-height: 18rem;
		font-family: 'SFMono-Regular', Consolas, monospace;
		font-size: 0.78rem;
		line-height: 1.45;
		resize: vertical;
	}

	.export-box summary {
		cursor: pointer;
		font-weight: 800;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.status-text {
		font-weight: 700;
		color: #7a5134 !important;
	}

	@media (max-width: 1100px) {
		.editor-header,
		.editor-grid {
			grid-template-columns: 1fr;
		}

		.placement-panel,
		.preview-panel {
			position: static;
			max-height: none;
			overflow: visible;
		}
	}

	@media (max-width: 700px) {
		.editor-shell {
			padding-inline: 1rem;
		}

		.trigger-grid,
			.photo-library > div,
			.source-photo-grid {
			grid-template-columns: 1fr;
		}

			.section-heading,
			.direct-write-card {
			align-items: stretch;
			flex-direction: column;
		}
	}
</style>