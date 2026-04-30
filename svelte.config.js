import adapter from '@sveltejs/adapter-static';

const normalizeBasePath = (value) => {
	if (!value || value === '/') return '';
	const withLeadingSlash = value.startsWith('/') ? value : `/${value}`;
	return withLeadingSlash.endsWith('/') ? withLeadingSlash.slice(0, -1) : withLeadingSlash;
};

const basePath = normalizeBasePath(process.env.BASE_PATH);

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => filename.split(/[/\\]/).includes('node_modules') ? undefined : true
	},
	kit: {
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			strict: true
		}),
		paths: {
			base: basePath
		}
	}
};

export default config;
