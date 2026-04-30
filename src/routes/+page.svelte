<script lang="ts">
	const letterSections = [
		{
			key: 'arrival',
			eyebrow: '01 / The first feeling',
			image: '/listing/front-exterior.jpg',
			imageLabel: 'A first look at the front garden and entry',
			paragraphs: [
				"Dear next owner,",
				"We weren't looking in this neighborhood when we came to the open house. The lot size and the space pulled us in, but it was wandering past the main house, past the cottage, into the workshop, and sitting in the backyard when the thought just landed: I want to live here. It persisted through a second open house, and every year since."
			]
		},
		{
			key: 'family',
			eyebrow: '02 / Room for every season',
			image: '/listing/flexible-cottage.jpg',
			imageLabel: 'The cottage that made the property live flexibly',
			paragraphs: [
				"The house has taken care of us as we've taken care of it. We welcomed our daughter here and watched her nursery slowly turn into a kid's room. Grandma moved into the back cottage and became a daily part of our daughter's life, giving us the kind of setup you don't really plan for, but can't imagine without once you have it. The same flexibility works just as well for guests, a home office, or whatever season of life you're in."
			]
		},
		{
			key: 'workshop',
			eyebrow: '03 / Work, weather, and the city',
			image: '/listing/workshop-office.jpg',
			imageLabel: 'A work-from-home retreat connected to the patio',
			paragraphs: [
				'The workshop became a real office. Full days of focused work out there, barn doors open to the patio because the weather is so often perfect. On commute days, a walk to MacArthur BART puts you in downtown San Francisco 25 minutes later, no car needed. That easy access alone changed how we thought about living on this side of the Bay.'
			]
		},
		{
			key: 'neighborhood',
			eyebrow: '04 / A calm block, close to everything',
			image: '/listing/evening-exterior.jpg',
			imageLabel: 'Evening light on a quiet Oakland block',
			paragraphs: [
				"The block itself is calm in a way that surprised us. No spillover from the commercial streets, just kids out front on weekends and the occasional neighbor stopping by. Telegraph is moments away, with coffee, groceries, dinner, and nightlife close at hand. Our weekends found their own rhythm: coffee with neighbors at Mellana's across the street, a walk to the farmer's market, long evenings in the backyard."
			]
		},
		{
			key: 'backyard',
			eyebrow: '05 / The place that changed everything',
			image: '/listing/backyard-retreat.jpg',
			imageLabel: 'Backyard greenery made for slow evenings',
			paragraphs: [
				"The house itself is wonderful, and we’ve spent countless hours in the front rooms with the light pouring in. But the backyard is what made the property different. The clawfoot tub tucked under the avocado tree is the best way to relax after a long week, save for the hot tub under the stars. Figs in late summer, hummingbirds drawn to the orange jubilee blooms, Makrut lime for cooking, grapes running along the fence. The redwoods in Kevin's yard next door arch over everything. We hosted often, but we also spent a lot of evenings out there doing nothing, which is the better endorsement."
			]
		},
		{
			key: 'goodbye',
			eyebrow: '06 / A home, again',
			image: '/listing/front-rooms.jpg',
			imageLabel: 'Interior rooms with warm natural light',
			paragraphs: [
				"We're leaving for reasons that have nothing to do with the house. What we want most is for it to be someone's home again, to take care of you the way it's taken care of us. We hope it lands for you the first time you sit out back.",
				'— Jacob and Amelia'
			]
		}
	] as const;

	const leadImage = letterSections[0];
</script>

<svelte:head>
	<title>666 46th St</title>
	<meta
		name="description"
		content="A refined editorial seller letter experience for 666 46th St in Oakland."
	/>
</svelte:head>

<main class="site-shell">
	<section class="hero editorial-grid" aria-labelledby="page-title">
		<header class="masthead">
			<span>666 46th St</span>
			<span>Oakland, California</span>
		</header>

		<div class="intro-copy">
			<p class="kicker">Seller letter</p>
			<h1 id="page-title">A property that first lands as a feeling.</h1>
			<p class="lede">
				A personal note from the sellers, set as a quiet editorial walk through the house,
				the cottage, the workshop, and the garden that made 666 46th St feel like home.
			</p>
		</div>

		<aside class="listing-card" aria-label="Open house details">
			<p class="listing-card__label">Now on the market</p>
			<p class="listing-card__address">666 46th St</p>
			<p>Open house this Saturday and Sunday</p>
			<p class="listing-card__time">2 - 4:30</p>
		</aside>
	</section>

	<section class="story editorial-grid" aria-label="Seller letter and property photography">
		<article class="letter" aria-label="Seller letter">
			{#each letterSections as section}
				<section
					class="letter-section"
					data-reading-section={section.key}
					data-image-src={section.image}
				>
					<p class="section-eyebrow">{section.eyebrow}</p>
					{#each section.paragraphs as paragraph}
						<p class:signature={paragraph.startsWith('—')}>{paragraph}</p>
					{/each}
				</section>
			{/each}
		</article>

		<aside class="photo-rail" aria-label="Property photos keyed to the letter">
			<figure class="feature-photo" data-active-image={leadImage.key}>
				<img src={leadImage.image} alt={leadImage.imageLabel} />
				<figcaption>{leadImage.imageLabel}</figcaption>
			</figure>

			<div class="photo-index" aria-label="Letter photo sequence">
				{#each letterSections as section}
					<figure class="photo-chip" data-image-key={section.key}>
						<img src={section.image} alt={section.imageLabel} loading="lazy" />
						<figcaption>{section.eyebrow.replace(/^[0-9]+ \/ /, '')}</figcaption>
					</figure>
				{/each}
			</div>
		</aside>
	</section>

	<footer class="page-footer editorial-grid">
		<p>666 46th St</p>
		<p>Open house this Saturday and Sunday, 2 - 4:30</p>
	</footer>
</main>
