<script lang="ts">
	import { onMount } from 'svelte';

	const plantMapPath = '/listing/plant-map.svg';

	const annotationLineRanges = [
		[295, 299],
		[300, 303],
		[304, 308],
		[309, 313],
		[314, 318],
		[319, 323],
		[324, 328],
		[329, 333],
		[334, 336],
		[337, 341],
		[342, 346],
		[347, 356],
		[357, 361],
		[362, 371],
		[372, 379],
		[380, 385],
		[386, 390],
		[391, 395]
	] as const satisfies readonly (readonly [number, number])[];
	const frontAnnotationLineRange = '372:379';

	let plantMapSvg = $state<string | null>(null);
	let isMapVisible = $state(false);
	let mapFrame: HTMLElement;

	function wrapPlantAnnotations(svg: string) {
		const lines = svg.split(/\r?\n/);
		const annotationStarts = new Map<number, { end: number; index: number; isFront: boolean }>(
			annotationLineRanges.map(([start, end], index) => [
				start,
				{ end, index, isFront: `${start}:${end}` === frontAnnotationLineRange }
			])
		);
		const annotationEnds = new Set<number>(annotationLineRanges.map(([, end]) => end));
		const output: string[] = [];
		const frontAnnotations: string[] = [];
		let frontAnnotation: string[] | null = null;

		lines.forEach((line, index) => {
			const lineNumber = index + 1;
			const annotation = annotationStarts.get(lineNumber);

			if (annotation) {
				const groupStart = `<g data-plant-annotation="" style="--annotation-delay: ${annotation.index * 85}ms">`;

				if (annotation.isFront) {
					frontAnnotation = [groupStart];
				} else {
					output.push(groupStart);
				}
			}

			if (frontAnnotation) {
				frontAnnotation.push(line);
			} else {
				output.push(line);
			}

			if (annotationEnds.has(lineNumber)) {
				if (frontAnnotation) {
					frontAnnotation.push('</g>');
					frontAnnotations.push(frontAnnotation.join('\n'));
					frontAnnotation = null;
				} else {
					output.push('</g>');
				}
			}
		});

		if (frontAnnotations.length) {
			const closingSvgIndex = output.lastIndexOf('</svg>');

			if (closingSvgIndex === -1) {
				output.push(...frontAnnotations);
			} else {
				output.splice(closingSvgIndex, 0, ...frontAnnotations);
			}
		}

		return output.join('\n');
	}

	onMount(() => {
		let isMounted = true;
		let observer: IntersectionObserver | null = null;

		void (async () => {
			try {
				const response = await fetch(plantMapPath);
				if (!response.ok) return;

				const svg = await response.text();
				if (isMounted) plantMapSvg = wrapPlantAnnotations(svg);
			} catch {
				plantMapSvg = null;
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
				{ rootMargin: '0px 0px -12% 0px', threshold: 0.16 }
			);

			observer.observe(mapFrame);
		}

		return () => {
			isMounted = false;
			observer?.disconnect();
		};
	});
</script>

<section class="plant-map-section" aria-labelledby="plant-map-title">
	<!-- <div class="plant-map-copy">
		<p class="plant-map-kicker">Planting map</p>
		<h2 id="plant-map-title">A backyard planned for shade, fruit, and small discoveries.</h2>
		<p>
			The original annotated garden plan keeps its plant callouts intact, letting the existing notes
			settle into view without adding extra markers or controls.
		</p>
	</div> -->

	<div
		bind:this={mapFrame}
		class="plant-map-frame"
		class:is-visible={isMapVisible}
		role="img"
		aria-label="Annotated planting map for 666 46th St"
	>
		{#if plantMapSvg}
			<div class="plant-map-svg" aria-hidden="true">{@html plantMapSvg}</div>
		{:else}
			<img src={plantMapPath} alt="Annotated planting map for 666 46th St" />
		{/if}
	</div>
</section>

<style>
	.plant-map-section {
		width: calc(100% - 2rem);
		background: #fff;
		margin: 0 1rem 1rem 1rem;
		/* padding-block: clamp(4rem, 8vw, 8rem) clamp(8rem, 14vw, 14rem); */
	}

	.plant-map-frame {
		max-width: 78vw;
		margin: 0 auto;
		/* overflow: hidden;
		border: 1px solid color-mix(in srgb, var(--ink) 10%, transparent);
		background: #fbfaf7;
		box-shadow: 0 2rem 5rem rgb(45 41 36 / 0.08); */
	}

	.plant-map-frame img,
	.plant-map-svg :global(svg) {
		display: block;
		width: 100%;
		height: auto;
		aspect-ratio: 3426 / 2551;
	}

	.plant-map-svg :global([data-plant-annotation]) {
		opacity: 0;
		transform: translateY(18px);
		transform-box: fill-box;
		transform-origin: center;
	}

	.plant-map-frame.is-visible .plant-map-svg :global([data-plant-annotation]) {
		animation: plant-annotation-in 700ms cubic-bezier(0.22, 1, 0.36, 1) both;
		animation-delay: var(--annotation-delay);
	}

	@keyframes plant-annotation-in {
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (max-width: 980px) {
	.plant-map-frame {
		max-width: 100%;
	}
	}

	@media (prefers-reduced-motion: reduce) {
		.plant-map-svg :global([data-plant-annotation]) {
			opacity: 1;
			transform: none;
			animation: none;
		}
	}
</style>