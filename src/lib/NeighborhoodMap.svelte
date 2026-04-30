<script lang="ts">
	import { onMount } from 'svelte';

	const mapPath = '/listing/neighborhood-map.svg';
	const mapGroups = [
		{ key: 'parks', label: 'Parks & Playgrounds', color: '#147F3D' },
		{ key: 'grocery', label: 'Grocery stores', color: '#BF3A19' },
		{ key: 'cafes', label: 'Cafes', color: '#3092C3' },
		{ key: 'gyms', label: 'Gyms', color: '#808BC2' },
		{ key: 'restaurants', label: 'Restaurants & Bars', color: '#086659' },
		{ key: 'bart', label: 'BART', color: '#272727' }
	] as const;

	type MapGroupKey = (typeof mapGroups)[number]['key'];

	const groupByFill = new Map(mapGroups.map((group) => [group.color.toUpperCase(), group]));

	let activeGroup = $state<MapGroupKey | null>(null);
	let isMapVisible = $state(false);
	let neighborhoodSvg = $state<string | null>(null);
	let mapFrame: HTMLElement;
	let svgHost = $state<HTMLElement | null>(null);

	function setActiveGroup(group: MapGroupKey | null) {
		activeGroup = group;
	}

	function normalizeFill(fill: string | null) {
		return fill?.trim().toUpperCase() ?? '';
	}

	function getDeclaredFill(element: Element) {
		const attrFill = normalizeFill(element.getAttribute('fill'));
		if (attrFill) return attrFill;

		const styleFill = element.getAttribute('style')?.match(/(?:^|;)\s*fill\s*:\s*([^;]+)/i)?.[1];
		return normalizeFill(styleFill ?? null);
	}

	function getFill(element: Element) {
		const ownFill = getDeclaredFill(element);
		if (ownFill) return ownFill;

		const filledChild = element.querySelector('[fill], [style*="fill"]');
		const childFill = filledChild ? getDeclaredFill(filledChild) : '';
		if (childFill) return childFill;

		let parent = element.parentElement;
		while (parent && parent.tagName.toLowerCase() !== 'svg') {
			const parentFill = getDeclaredFill(parent);
			if (parentFill) return parentFill;
			parent = parent.parentElement;
		}

		return '';
	}

	function markVisibleMapText(text: SVGElement) {
		text.setAttribute('data-map-point', '');
		text.setAttribute('data-map-label', '');
		text.setAttribute('font-family', 'Inter, sans-serif');
		text.style.setProperty('font-family', 'Inter, sans-serif');
		text.removeAttribute('opacity');
		text.style.removeProperty('opacity');
		text.style.setProperty('fill-opacity', '1');
		text.style.setProperty('stroke-opacity', '1');
		for (const tspan of text.querySelectorAll<SVGElement>('tspan')) {
			tspan.setAttribute('font-family', 'Inter, sans-serif');
			tspan.style.setProperty('font-family', 'Inter, sans-serif');
			tspan.removeAttribute('opacity');
			tspan.style.removeProperty('opacity');
			tspan.style.setProperty('fill-opacity', '1');
			tspan.style.setProperty('stroke-opacity', '1');
		}
	}

	function transformNeighborhoodSvg(svg: string) {
		const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
		const root = document.querySelector('svg');

		if (!root) return svg;

		root.setAttribute('aria-hidden', 'true');
		root.setAttribute('focusable', 'false');
		root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
		root.classList.add('neighborhood-map-root');

		let itemIndex = 0;
		for (const text of root.querySelectorAll<SVGElement>('text')) {
			const group = groupByFill.get(getFill(text));

			markVisibleMapText(text);
			if (group) text.setAttribute('data-neighborhood-group', group.key);
			text.style.setProperty('--map-item-delay', `${itemIndex * 28}ms`);
			itemIndex += 1;
		}

		for (const element of root.querySelectorAll<SVGElement>('circle')) {
			const group = groupByFill.get(getFill(element));

			if (!group) continue;

			element.setAttribute('data-neighborhood-group', group.key);
			element.setAttribute('data-map-point', '');
			element.style.setProperty('--map-item-delay', `${itemIndex * 28}ms`);
			itemIndex += 1;
		}

		return new XMLSerializer().serializeToString(root);
	}

	$effect(() => {
		if (!svgHost || !neighborhoodSvg) return;

		for (const element of svgHost.querySelectorAll<SVGElement>('[data-neighborhood-group]')) {
			const isHighlighted = activeGroup === element.getAttribute('data-neighborhood-group');
			const isMuted = Boolean(activeGroup) && !isHighlighted;

			element.classList.toggle('is-highlighted', isHighlighted);
			element.classList.toggle('is-muted', isMuted);
		}
	});

	onMount(() => {
		let isMounted = true;
		let observer: IntersectionObserver | null = null;

		void (async () => {
			try {
				const response = await fetch(mapPath);
				if (!response.ok) return;

				const svg = await response.text();
				if (isMounted) neighborhoodSvg = transformNeighborhoodSvg(svg);
			} catch {
				neighborhoodSvg = null;
			}
		})();

		if (!('IntersectionObserver' in window) || !mapFrame) {
			isMapVisible = true;
		} else {
			observer = new IntersectionObserver(
				([entry]) => {
					if (!entry?.isIntersecting) return;

					isMapVisible = true;
					observer?.disconnect();
				},
				{ rootMargin: '0px 0px -10% 0px', threshold: 0.12 }
			);

			observer.observe(mapFrame);
		}

		return () => {
			isMounted = false;
			observer?.disconnect();
		};
	});
</script>

<section class="neighborhood-map-section" aria-labelledby="neighborhood-map-title">
	<div class="neighborhood-map-copy">
		<p class="neighborhood-map-kicker">Around the neighborhood</p>
		<h2 id="neighborhood-map-title">Temescal favorites, parks, cafes, and transit close by.</h2>
		<p>Hover or focus a category to trace that kind of destination across the map.</p>
	</div>

	<div
		bind:this={mapFrame}
		class="neighborhood-map-frame"
		class:is-visible={isMapVisible}
		class:has-active-filter={Boolean(activeGroup)}
		role="img"
		aria-label="Neighborhood map of parks, restaurants, cafes, groceries, gyms, and BART near 666 46th St"
	>
		{#if neighborhoodSvg}
			<div bind:this={svgHost} class="neighborhood-map-svg">{@html neighborhoodSvg}</div>
		{:else}
			<img src={mapPath} alt="Neighborhood map near 666 46th St" loading="lazy" decoding="async" />
		{/if}
	</div>

	<div class="neighborhood-map-legend" aria-label="Neighborhood map category filters">
		{#each mapGroups as group}
			<button
				type="button"
				class="legend-control"
				class:is-active={activeGroup === group.key}
				aria-pressed={activeGroup === group.key}
				onpointerenter={() => setActiveGroup(group.key)}
				onpointerleave={() => setActiveGroup(null)}
				onfocus={() => setActiveGroup(group.key)}
				onblur={() => setActiveGroup(null)}
				onkeydown={(event) => {
					if (event.key === 'Escape') {
						setActiveGroup(null);
						(event.currentTarget as HTMLButtonElement).blur();
					}
				}}
			>
				<span class="legend-dot" style:background={group.color}></span>
				<span>{group.label}</span>
			</button>
		{/each}
	</div>
</section>

<style>
	.neighborhood-map-section {
		width: min(100% - (var(--page-gutter) * 2), 1800px);
		margin: 0 auto;
		padding-block: clamp(4rem, 10vw, 8rem) clamp(5rem, 12vw, 10rem);
		color: var(--ink);
	}

	.neighborhood-map-copy {
		max-width: 52rem;
		margin: 0 auto clamp(2rem, 5vw, 4rem);
		text-align: center;
	}

	.neighborhood-map-kicker {
		margin: 0 0 0.8rem;
		font-family: Inter, sans-serif;
		font-size: 0.75rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--muted-ink);
	}

	.neighborhood-map-copy h2 {
		margin: 0;
		font-size: clamp(2.4rem, 6vw, 6.5rem);
		font-weight: 300;
		line-height: 0.95;
		letter-spacing: -0.055em;
	}

	.neighborhood-map-copy p:last-child {
		max-width: 34rem;
		margin: 1.1rem auto 0;
		font-family: Inter, sans-serif;
		font-size: clamp(0.95rem, 1.3vw, 1.12rem);
		line-height: 1.6;
		color: var(--muted-ink);
	}

	.neighborhood-map-frame {
		overflow: hidden;
		background: #fbfaf7;
		box-shadow: 0 2rem 5rem rgb(0 0 0 / 0.2);
	}

	.neighborhood-map-frame img,
	.neighborhood-map-svg :global(svg) {
		display: block;
		width: 100%;
		height: auto;
		font-family: Inter, sans-serif;
	}

	.neighborhood-map-svg :global(text),
	.neighborhood-map-svg :global(tspan) {
		font-family: Inter, sans-serif !important;
		fill-opacity: 1 !important;
		stroke-opacity: 1 !important;
	}

	.neighborhood-map-svg :global([data-map-point]) {
		opacity: 0;
		transition:
			opacity 180ms ease,
			filter 180ms ease;
	}

	.neighborhood-map-svg :global([data-map-label]) {
		paint-order: stroke fill;
	}

	.neighborhood-map-frame.is-visible .neighborhood-map-svg :global([data-map-point]) {
		opacity: 1;
		animation: neighborhood-map-point-in 620ms ease-out both;
		animation-delay: var(--map-item-delay);
	}

	.neighborhood-map-frame.has-active-filter .neighborhood-map-svg :global(.is-muted) {
		opacity: 0.14 !important;
		filter: grayscale(1) saturate(0.45);
	}

	.neighborhood-map-frame.has-active-filter .neighborhood-map-svg :global(.is-highlighted) {
		opacity: 1 !important;
		filter: drop-shadow(0 0 0.5rem rgb(255 255 255 / 0.9));
	}

	.neighborhood-map-legend {
		margin: clamp(1rem, 2.5vw, 1.75rem) auto 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.65rem;
		font-family: Inter, sans-serif;
	}

	.legend-control {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		border: 1px solid color-mix(in srgb, var(--ink) 18%, transparent);
		border-radius: 999px;
		padding: 0.62rem 0.86rem;
		background: color-mix(in srgb, var(--ink) 8%, transparent);
		color: var(--ink);
		font: inherit;
		font-size: 0.84rem;
		cursor: pointer;
		transition:
			background-color 160ms ease,
			border-color 160ms ease,
			transform 160ms ease;
	}

	.legend-control:hover,
	.legend-control:focus-visible,
	.legend-control.is-active {
		border-color: color-mix(in srgb, var(--ink) 48%, transparent);
		background: color-mix(in srgb, var(--ink) 16%, transparent);
		transform: translateY(-1px);
		outline: none;
	}

	.legend-dot {
		width: 0.72rem;
		height: 0.72rem;
		border-radius: 999px;
		box-shadow: 0 0 0 2px rgb(255 255 255 / 0.32);
	}

	@keyframes neighborhood-map-point-in {
		from {
			opacity: 0;
			filter: blur(3px);
		}

		to {
			opacity: 1;
			filter: none;
		}
	}

	@media (max-width: 720px) {
		.neighborhood-map-section {
			width: min(100% - 1.25rem, 1800px);
		}

		.neighborhood-map-frame {
			overflow-x: auto;
		}

		.neighborhood-map-svg,
		.neighborhood-map-frame img {
			min-width: 56rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.neighborhood-map-svg :global([data-map-point]) {
			opacity: 1;
			animation: none !important;
			transition-duration: 1ms;
		}

		.legend-control {
			transition-duration: 1ms;
		}
	}
</style>