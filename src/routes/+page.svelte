<script lang="ts">
	import { onMount } from 'svelte';
	import PlantMap from '$lib/PlantMap.svelte';
	import {
		letterSections,
		photoTriggers,
		isPhotoTriggerKey,
		splitReadableText,
		type PhotoTrigger,
		type PhotoTriggerKey
	} from '$lib/listing-content';

	let activeTriggerKey = $state<PhotoTriggerKey>(photoTriggers[0].key);
	const activeTrigger = $derived(
		photoTriggers.find((trigger) => trigger.key === activeTriggerKey) ?? photoTriggers[0]
	);
	const pageUrl = 'https://66646th.com/';
	const pageTitle = '666 46th St';
	const pageDescription =
		'Come visit our lovely compound near Temescal, open house first weekend of May';
	const shareImageUrl = 'https://66646th.com/og.png';
	const readingLineRatio = 1 / 3;
	const lineTopTolerance = 2;

	const getInlinePhotosForParagraph = (
		sectionKey: string,
		paragraphIndex: number
	): PhotoTrigger[] => {
		const seenImages = new Set<string>();
		const paragraphTriggers: PhotoTrigger[] = [];
		const sortedParagraphTriggers = photoTriggers
			.filter((trigger) => trigger.sectionKey === sectionKey && trigger.paragraphIndex === paragraphIndex)
			.sort((first, second) => first.tokenIndex - second.tokenIndex);

		for (const trigger of sortedParagraphTriggers) {
			if (seenImages.has(trigger.image)) continue;

			seenImages.add(trigger.image);
			paragraphTriggers.push(trigger);
		}

		return paragraphTriggers;
	};

	type WordSnapshot = {
		element: HTMLElement;
		top: number;
		bottom: number;
	};

	type VisualLine = {
		top: number;
		bottom: number;
		words: WordSnapshot[];
	};

	onMount(() => {
		const words = Array.from(document.querySelectorAll<HTMLElement>('.read-word'));
		const getReadingLine = () => window.innerHeight * readingLineRatio;
		let frame = 0;

		const getVisualLines = () => {
			const lines: VisualLine[] = [];

			for (const element of words) {
				const bounds = element.getBoundingClientRect();
				const snapshot = { element, top: bounds.top, bottom: bounds.bottom };
				const currentLine = lines.at(-1);

				if (currentLine && Math.abs(currentLine.top - bounds.top) <= lineTopTolerance) {
					currentLine.words.push(snapshot);
					currentLine.top = Math.min(currentLine.top, bounds.top);
					currentLine.bottom = Math.max(currentLine.bottom, bounds.bottom);
					continue;
				}

				lines.push({ top: bounds.top, bottom: bounds.bottom, words: [snapshot] });
			}

			return lines;
		};

		const getReadWordCount = (line: VisualLine, lineIndex: number, lines: VisualLine[], readingLine: number) => {
			const nextLineTop = lines[lineIndex + 1]?.top;
			const lineEnd = Math.max(line.bottom, nextLineTop ?? line.bottom);

			if (lineEnd <= readingLine) return line.words.length;
			if (line.top > readingLine) return 0;

			const lineProgress = Math.max(0, Math.min(1, (readingLine - line.top) / Math.max(lineEnd - line.top, 1)));
			return lineProgress === 0 ? 0 : Math.ceil(lineProgress * line.words.length);
		};

		const updateReadingState = () => {
			frame = 0;
			const readingLine = getReadingLine();
			const hasStartedReading = window.scrollY > 0;
			let nextActiveKey: string | undefined = photoTriggers[0]?.key;
			const lines = getVisualLines();

			for (const [lineIndex, line] of lines.entries()) {
				const readWordCount = hasStartedReading
					? getReadWordCount(line, lineIndex, lines, readingLine)
					: 0;

				for (const [wordIndex, word] of line.words.entries()) {
					const isRead = wordIndex < readWordCount;
					const triggerKey = word.element.dataset.photoTrigger;

					word.element.classList.toggle('is-read', isRead);

					if (isRead && triggerKey) {
						nextActiveKey = triggerKey;
					}
				}
			}

			if (isPhotoTriggerKey(nextActiveKey) && nextActiveKey !== activeTriggerKey) {
				activeTriggerKey = nextActiveKey;
			}
		};

		const queueReadingUpdate = () => {
			if (frame) return;
			frame = window.requestAnimationFrame(updateReadingState);
		};

		updateReadingState();
		window.addEventListener('scroll', queueReadingUpdate, { passive: true });
		window.addEventListener('resize', queueReadingUpdate);

		return () => {
			if (frame) window.cancelAnimationFrame(frame);
			window.removeEventListener('scroll', queueReadingUpdate);
			window.removeEventListener('resize', queueReadingUpdate);
		};
	});
</script>

<svelte:head>
	<title>{pageTitle}</title>
	<meta name="description" content={pageDescription} />
	<link rel="canonical" href={pageUrl} />
	<meta property="og:url" content={pageUrl} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="666 46th St" />
	<meta property="og:title" content={pageTitle} />
	<meta property="og:description" content={pageDescription} />
	<meta property="og:image" content={shareImageUrl} />
	<meta property="og:image:secure_url" content={shareImageUrl} />
	<meta property="og:image:type" content="image/png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="Exterior view of 666 46th St." />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={pageTitle} />
	<meta name="twitter:description" content={pageDescription} />
	<meta name="twitter:image" content={shareImageUrl} />
	<meta name="twitter:image:alt" content="Exterior view of 666 46th St." />
	{#each photoTriggers as trigger}
		<link rel="preload" as="image" href={trigger.image} />
	{/each}
</svelte:head>

<main class="site-shell">
	<section class="letter-page" aria-label="Seller letter and property details">
		<article class="letter" aria-label="Seller letter">
		<svg class="flower" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="-5.0 -10.0 110.0 135.0" width="3em">
 <path d="m25.418 64.82c-10.703 4.4023-22.434 7.1641-24.551-0.61328-1.6133-5.9336 8.2852-10.031 18.836-12.672-10.922-1.7188-21.922-5.625-18.039-14.512 3.2773-7.4922 10.797-7.7812 18.523-5.5156-7.6875-7.1016-13.02-15.055-7.0234-20.52 4.6445-4.2383 13.891 5.1367 21.605 14.961-3.3164-10.434-3.6406-22.004 10.215-23.641 11.754-1.3906 13.156 10.395 11.926 21.629 6.0352-10.695 13.938-20.902 20.602-16.867 5.8164 3.5195 0.0625 13.527-7.375 22.867 8.6484-5.1016 18.176-8.207 22.496-1.0039 4.6914 7.8203-4.1875 13.785-14.105 17.773 11.5 0.20703 22.246 2.6328 21.156 11.172-1.1406 8.9102-11.68 8.6875-22.406 6.0117 7.1016 5.5703 12.137 12.312 6.168 18.066-7.7695 7.4922-17.703-0.49609-24.918-8.9297 2.2305 11.18 2.6484 23.621-6.1484 24.656-8.9336 1.0469-10.352-13.047-9.9375-25.23-6.5469 11.645-16.668 25.938-23.707 18.5-6.9531-7.3398-0.57422-17.969 6.6836-26.133zm22.195-30.539c-7.4062 0-13.422 6.2617-13.422 13.98s6.0156 13.984 13.422 13.984 13.418-6.2656 13.418-13.984-6.0117-13.98-13.418-13.98z" fill-rule="evenodd"/>
</svg>
			{#each letterSections as section}
					<section class="letter-section" data-reading-section={section.key}>
						{#each section.paragraphs as paragraph, paragraphIndex}
							<p class:signature={paragraph.startsWith('—')}>
								{#each splitReadableText(paragraph) as token, tokenIndex}
									{@const trigger = photoTriggers.find(
										(item) =>
											item.sectionKey === section.key &&
											item.paragraphIndex === paragraphIndex &&
											item.tokenIndex === tokenIndex
									)}
									{#if token.trim()}
										<span class="read-word" data-photo-trigger={trigger?.key}>{token}</span>
									{:else}{token}{/if}
								{/each}
							</p>
							{@const inlineTriggers = getInlinePhotosForParagraph(section.key, paragraphIndex)}
							{#if inlineTriggers.length}
								<figure class="mobile-inline-photo">
									{#each inlineTriggers as inlineTrigger (inlineTrigger.image)}
										<img
											src={inlineTrigger.image}
											alt={inlineTrigger.imageLabel}
											loading="lazy"
											decoding="async"
										/>
									{/each}
								</figure>
							{/if}
					{/each}
				</section>
			{/each}
		</article>

		<aside class="visual-column" aria-label="Property photo and open house details">
			<figure
				class="feature-photo"
				data-active-image={activeTrigger.key}
				role="img"
				aria-label={activeTrigger.imageLabel}
				style:background-image={`url("${activeTrigger.image}")`}
				>
					{#each photoTriggers as trigger (trigger.key)}
						<div
							class="feature-photo-layer"
							class:active-photo-layer={trigger.key === activeTrigger.key}
							aria-hidden="true"
							style:background-image={`url("${trigger.image}")`}
						></div>
					{/each}
				</figure>

			<dl class="property-details" aria-label="Open house details">
				<div>
					<!-- <dt>Address</dt> -->
					<dd>666 46th St</dd>
					<dd>Oakland, California</dd>
				</div>

				<div>
					<!-- <dt>Open House</dt> -->
					<dd>Come by this Saturday and Sunday</dd>
					<dd>2 – 4:30 PM</dd>
				</div>
			</dl>
		</aside>
	</section>

		<PlantMap />
</main>
