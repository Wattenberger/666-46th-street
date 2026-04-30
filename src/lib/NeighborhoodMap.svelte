<script lang="ts">
	import { onMount } from 'svelte';

	const mapPath = '/listing/neighborhood-map.svg';
	const mapGroups = [
		{ key: 'parks', label: 'Parks & Playgrounds', color: '#5DB481', legendTop: 3.6, legendWidth: 14 },
		{ key: 'grocery', label: 'Grocery stores', color: '#A25575', legendTop: 6.2, legendWidth: 10 },
		{ key: 'cafes', label: 'Cafes', color: '#EC6556', legendTop: 8.8, legendWidth: 5 },
		{ key: 'gyms', label: 'Gyms', color: '#808BC2', legendTop: 11.4, legendWidth: 5 },
		{ key: 'restaurants', label: 'Restaurants & Bars', color: '#439C9D', legendTop: 14, legendWidth: 13 },
		{ key: 'bart', label: 'BART', color: '#272727', legendTop: 16.6, legendWidth: 5 }
	] as const;

	type MapGroupKey = (typeof mapGroups)[number]['key'];

	const groupByFill = new Map(mapGroups.map((group) => [group.color.toUpperCase(), group]));
	const groupByLabel: Map<string, (typeof mapGroups)[number]> = new Map(
		mapGroups.map((group) => [group.label, group])
	);

	let activeGroup = $state<MapGroupKey | null>(null);
	let isMapVisible = $state(false);
	let neighborhoodSvg = $state<string | null>(null);
	let mapFrame: HTMLElement;
	let svgHost = $state<HTMLElement | null>(null);

	function setActiveGroup(group: MapGroupKey | null) {
		activeGroup = group;
	}

	function clearActiveGroupAndBlur(event: Event) {
		setActiveGroup(null);
		(event.currentTarget as HTMLElement).blur();
	}

	function normalizeText(value: string | null) {
		return value?.replace(/\s+/g, ' ').trim() ?? '';
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

	function markEmbeddedLegendControl(text: SVGElement, group: (typeof mapGroups)[number]) {
		text.setAttribute('data-neighborhood-legend', '');
		text.setAttribute('role', 'button');
		text.setAttribute('tabindex', '0');
		text.setAttribute('focusable', 'true');
		text.setAttribute('aria-label', `Filter neighborhood map: ${group.label}`);
		text.setAttribute('aria-pressed', 'false');
	}

	function getLegendControl(target: EventTarget | null) {
		if (!(target instanceof Element)) return null;
		return target.closest<SVGElement>('[data-neighborhood-legend]');
	}

	function setActiveGroupFromLegend(target: EventTarget | null) {
		const control = getLegendControl(target);
		const group = control?.getAttribute('data-neighborhood-group') as MapGroupKey | null;

		if (!group) return false;

		setActiveGroup(group);
		return true;
	}

	function getDelayQueue(
		queues: Map<MapGroupKey, string[]>,
		group: (typeof mapGroups)[number]
	) {
		let queue = queues.get(group.key);

		if (!queue) {
			queue = [];
			queues.set(group.key, queue);
		}

		return queue;
	}

	function transformNeighborhoodSvg(svg: string) {
		const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
		const root = document.querySelector('svg');

		if (!root) return svg;

		root.removeAttribute('aria-hidden');
		root.setAttribute('role', 'group');
		root.setAttribute('aria-label', 'Neighborhood map with embedded category filters');
		root.setAttribute('focusable', 'false');
		root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
		root.classList.add('neighborhood-map-root');

		let itemIndex = 0;
		const groupedLabelDelays = new Map<MapGroupKey, string[]>();
		for (const text of root.querySelectorAll<SVGElement>('text')) {
			const group = groupByFill.get(getFill(text));
			const legendGroup = groupByLabel.get(normalizeText(text.textContent));
			const delay = `${itemIndex * 28}ms`;

			markVisibleMapText(text);
			if (group) {
				text.setAttribute('data-neighborhood-group', group.key);
				if (!legendGroup) getDelayQueue(groupedLabelDelays, group).push(delay);
			}
			if (legendGroup) {
				text.setAttribute('data-neighborhood-group', legendGroup.key);
				markEmbeddedLegendControl(text, legendGroup);
			}
			text.style.setProperty('--map-item-delay', delay);
			itemIndex += 1;
		}

		for (const element of root.querySelectorAll<SVGElement>('circle')) {
			const group = groupByFill.get(getFill(element));

			if (!group) continue;

			element.setAttribute('data-neighborhood-group', group.key);
			element.setAttribute('data-map-point', '');
			element.style.setProperty(
				'--map-item-delay',
				getDelayQueue(groupedLabelDelays, group).shift() ?? `${itemIndex * 28}ms`
			);
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

		for (const legend of svgHost.querySelectorAll<SVGElement>('[data-neighborhood-legend]')) {
			legend.setAttribute(
				'aria-pressed',
				String(activeGroup === legend.getAttribute('data-neighborhood-group'))
			);
		}
	});

	$effect(() => {
		if (!svgHost || !neighborhoodSvg) return;
		const host = svgHost;

		const handlePointerOver = (event: PointerEvent) => {
			setActiveGroupFromLegend(event.target);
		};

		const handlePointerOut = (event: PointerEvent) => {
			const from = getLegendControl(event.target);
			const to = getLegendControl(event.relatedTarget);

			if (from && from !== to) setActiveGroup(null);
		};

		const handleFocusIn = (event: FocusEvent) => {
			setActiveGroupFromLegend(event.target);
		};

		const handleFocus = (event: FocusEvent) => {
			setActiveGroupFromLegend(event.target);
		};

		const handleFocusOut = (event: FocusEvent) => {
			if (getLegendControl(event.target) && !getLegendControl(event.relatedTarget)) {
				setActiveGroup(null);
			}
		};

		const handleBlur = (event: FocusEvent) => {
			if (getLegendControl(event.target) && !getLegendControl(event.relatedTarget)) {
				setActiveGroup(null);
			}
		};

		const handleClick = (event: MouseEvent) => {
			if (setActiveGroupFromLegend(event.target)) event.preventDefault();
		};

		const handleKeyDown = (event: KeyboardEvent) => {
			const control = getLegendControl(event.target);

			if (!control) return;

			if (event.key === 'Escape') {
				setActiveGroup(null);
				control.blur();
				event.preventDefault();
			} else if (event.key === 'Enter' || event.key === ' ') {
				setActiveGroupFromLegend(control);
				event.preventDefault();
			}
		};

		host.addEventListener('pointerover', handlePointerOver);
		host.addEventListener('pointerout', handlePointerOut);
		host.addEventListener('focus', handleFocus, true);
		host.addEventListener('focusin', handleFocusIn);
		host.addEventListener('blur', handleBlur, true);
		host.addEventListener('focusout', handleFocusOut);
		host.addEventListener('click', handleClick);
		host.addEventListener('keydown', handleKeyDown);

		return () => {
			host.removeEventListener('pointerover', handlePointerOver);
			host.removeEventListener('pointerout', handlePointerOut);
			host.removeEventListener('focus', handleFocus, true);
			host.removeEventListener('focusin', handleFocusIn);
			host.removeEventListener('blur', handleBlur, true);
			host.removeEventListener('focusout', handleFocusOut);
			host.removeEventListener('click', handleClick);
			host.removeEventListener('keydown', handleKeyDown);
		};
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
		<p id="neighborhood-map-title" class="neighborhood-map-kicker">Neighborhood highlights</p>
	</div>

	<div
		bind:this={mapFrame}
		class="neighborhood-map-frame"
		class:is-visible={isMapVisible}
		class:has-active-filter={Boolean(activeGroup)}
		role="group"
		aria-label="Interactive neighborhood map of parks, restaurants, cafes, groceries, gyms, and BART near 666 46th St"
	>
		{#if neighborhoodSvg}
			<div bind:this={svgHost} class="neighborhood-map-svg">{@html neighborhoodSvg}</div>
		{:else}
			<img src={mapPath} alt="Neighborhood map near 666 46th St" loading="lazy" decoding="async" />
		{/if}
		<div class="embedded-legend-hitareas" aria-label="Neighborhood map category filters">
			{#each mapGroups as group}
				<button
					type="button"
					class="embedded-legend-hitarea"
					style={`top: ${group.legendTop}%; width: ${group.legendWidth}%;`}
					aria-label={`Filter neighborhood map: ${group.label}`}
					aria-pressed={activeGroup === group.key}
					onpointerenter={() => setActiveGroup(group.key)}
					onpointerleave={() => setActiveGroup(null)}
					onfocus={() => setActiveGroup(group.key)}
					onblur={() => setActiveGroup(null)}
					onkeydown={(event) => {
						if (event.key === 'Escape') clearActiveGroupAndBlur(event);
					}}
				>
					<span>{group.label}</span>
				</button>
			{/each}
		</div>
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
		margin: 0 auto clamp(1rem, 2.5vw, 1.75rem);
		text-align: center;
	}

	.neighborhood-map-kicker {
		margin: 0;
		font-family: Inter, sans-serif;
		font-size: 0.75rem;
		letter-spacing: 0.22em;
		text-transform: uppercase;
		color: var(--muted-ink);
	}

	.neighborhood-map-frame {
		position: relative;
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

	.neighborhood-map-svg :global([data-neighborhood-legend]) {
		cursor: pointer;
		transition: filter 180ms ease;
	}

	.neighborhood-map-svg :global([data-neighborhood-legend]:focus-visible) {
		outline: none;
		filter: drop-shadow(0 0 0.45rem rgb(255 255 255 / 0.95));
		text-decoration: underline;
	}

	.embedded-legend-hitareas {
		position: absolute;
		inset: 0;
		pointer-events: none;
		font-family: Inter, sans-serif;
	}

	.embedded-legend-hitarea {
		position: absolute;
		left: 1.7%;
		height: 2.35%;
		border: 0;
		border-radius: 0.15rem;
		background: transparent;
		color: transparent;
		cursor: pointer;
		pointer-events: auto;
	}

	.embedded-legend-hitarea:focus-visible {
		outline: 2px solid color-mix(in srgb, var(--ink) 58%, transparent);
		outline-offset: 2px;
	}

	.embedded-legend-hitarea span {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
		border: 0;
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
		.neighborhood-map-frame img,
		.embedded-legend-hitareas {
			min-width: 56rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.neighborhood-map-svg :global([data-map-point]) {
			opacity: 1;
			animation: none !important;
			transition-duration: 1ms;
		}

		.neighborhood-map-svg :global([data-neighborhood-legend]) {
			transition-duration: 1ms;
		}
	}
</style>