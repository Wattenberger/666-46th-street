<script lang="ts">
	import { onMount } from 'svelte';

	const letterSections = [
		{
			key: 'arrival',
			image: '/listing/front-exterior.jpg',
			imageLabel: 'A first look at the front garden and entry',
			paragraphs: [
				"Dear next owner,",
				"We weren't looking in this neighborhood when we came to the open house. The lot size and the space pulled us in, but it was wandering past the main house, past the cottage, into the workshop, and sitting in the backyard when the thought just landed: I want to live here. It persisted through a second open house, and every year since."
			]
		},
		{
			key: 'family',
			image: '/listing/flexible-cottage.jpg',
			imageLabel: 'The cottage that made the property live flexibly',
			paragraphs: [
				"The house has taken care of us as we've taken care of it. We welcomed our daughter here and watched her nursery slowly turn into a kid's room. Grandma moved into the back cottage and became a daily part of our daughter's life, giving us the kind of setup you don't really plan for, but can't imagine without once you have it. The same flexibility works just as well for guests, a home office, or whatever season of life you're in."
			]
		},
		{
			key: 'workshop',
			image: '/listing/workshop-office.jpg',
			imageLabel: 'A work-from-home retreat connected to the patio',
			paragraphs: [
				'The workshop became a real office. Full days of focused work out there, barn doors open to the patio because the weather is so often perfect. On commute days, a walk to MacArthur BART puts you in downtown San Francisco 25 minutes later, no car needed. That easy access alone changed how we thought about living on this side of the Bay.'
			]
		},
		{
			key: 'neighborhood',
			image: '/listing/evening-exterior.jpg',
			imageLabel: 'Evening light on a quiet Oakland block',
			paragraphs: [
				"The block itself is calm in a way that surprised us. No spillover from the commercial streets, just kids out front on weekends and the occasional neighbor stopping by. Telegraph is moments away, with coffee, groceries, dinner, and nightlife close at hand. Our weekends found their own rhythm: coffee with neighbors at Mellana's across the street, a walk to the farmer's market, long evenings in the backyard."
			]
		},
		{
			key: 'backyard',
			image: '/listing/backyard-retreat.jpg',
			imageLabel: 'Backyard greenery made for slow evenings',
			paragraphs: [
				"The house itself is wonderful, and we’ve spent countless hours in the front rooms with the light pouring in. But the backyard is what made the property different. The clawfoot tub tucked under the avocado tree is the best way to relax after a long week, save for the hot tub under the stars. Figs in late summer, hummingbirds drawn to the orange jubilee blooms, Makrut lime for cooking, grapes running along the fence. The redwoods in Kevin's yard next door arch over everything. We hosted often, but we also spent a lot of evenings out there doing nothing, which is the better endorsement."
			]
		},
		{
			key: 'goodbye',
			image: '/listing/front-rooms.jpg',
			imageLabel: 'Interior rooms with warm natural light',
			paragraphs: [
				"We're leaving for reasons that have nothing to do with the house. What we want most is for it to be someone's home again, to take care of you the way it's taken care of us. We hope it lands for you the first time you sit out back.",
				'— Jacob and Amelia'
			]
		}
	] as const;

	type SectionKey = (typeof letterSections)[number]['key'];

	let activeSectionKey = $state<SectionKey>(letterSections[0].key);
	const activeSection = $derived(
		letterSections.find((section) => section.key === activeSectionKey) ?? letterSections[0]
	);

	function splitReadableText(paragraph: string) {
		return paragraph.split(/(\s+)/).filter(Boolean);
	}

	function isSectionKey(value: string | undefined): value is SectionKey {
		return letterSections.some((section) => section.key === value);
	}

	function clamp(value: number) {
		return Math.min(Math.max(value, 0), 1);
	}

	onMount(() => {
		const words = Array.from(document.querySelectorAll<HTMLElement>('.read-word'));
		const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-reading-section]'));
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
		let frame = 0;

		const updateReadingState = () => {
			frame = 0;
			const readingLine = window.innerHeight / 3;
			let nextActiveKey = sections[0]?.dataset.readingSection;

			for (const section of sections) {
				const bounds = section.getBoundingClientRect();
				const key = section.dataset.readingSection;

				if (!key) continue;
				if (bounds.bottom < readingLine) {
					nextActiveKey = key;
					continue;
				}

				nextActiveKey = key;
				break;
			}

			if (isSectionKey(nextActiveKey) && nextActiveKey !== activeSectionKey) {
				activeSectionKey = nextActiveKey;
			}

			for (const word of words) {
				const bounds = word.getBoundingClientRect();
				const progress = reducedMotion.matches
					? Number(bounds.bottom <= readingLine)
					: clamp((readingLine - bounds.top) / Math.max(bounds.height, 1));

				word.style.setProperty('--word-progress', progress.toFixed(3));
			}
		};

		const queueReadingUpdate = () => {
			if (frame) return;
			frame = window.requestAnimationFrame(updateReadingState);
		};

		updateReadingState();
		window.addEventListener('scroll', queueReadingUpdate, { passive: true });
		window.addEventListener('resize', queueReadingUpdate);
		reducedMotion.addEventListener('change', queueReadingUpdate);

		return () => {
			if (frame) window.cancelAnimationFrame(frame);
			window.removeEventListener('scroll', queueReadingUpdate);
			window.removeEventListener('resize', queueReadingUpdate);
			reducedMotion.removeEventListener('change', queueReadingUpdate);
		};
	});
</script>

<svelte:head>
	<title>666 46th St</title>
	<meta
		name="description"
		content="A seller letter for the next owner of 666 46th St in Oakland."
	/>
</svelte:head>

<main class="site-shell">
	<section class="letter-page" aria-label="Seller letter and property details">
		<article class="letter" aria-label="Seller letter">
			{#each letterSections as section}
					<section class="letter-section" data-reading-section={section.key}>
					{#each section.paragraphs as paragraph}
							<p class:signature={paragraph.startsWith('—')}>
								{#each splitReadableText(paragraph) as token}
									{#if token.trim()}
										<span class="read-word">{token}</span>
									{:else}{token}{/if}
								{/each}
							</p>
					{/each}
				</section>
			{/each}
		</article>

		<aside class="visual-column" aria-label="Property photo and open house details">
				<figure class="feature-photo" data-active-image={activeSection.key}>
					{#each letterSections as section}
						<img
							class:active-photo={section.key === activeSectionKey}
							src={section.image}
							alt={section.key === activeSectionKey ? section.imageLabel : ''}
							aria-hidden={section.key !== activeSectionKey}
						/>
					{/each}
			</figure>

			<dl class="property-details" aria-label="Open house details">
				<div>
					<dt>Address</dt>
					<dd>666 46th St</dd>
					<dd>Oakland, California</dd>
				</div>

				<div>
					<dt>Open House</dt>
					<dd>Saturday and Sunday</dd>
					<dd>2–4:30</dd>
				</div>
			</dl>
		</aside>
	</section>
</main>
