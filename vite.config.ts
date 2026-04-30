import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { localEditorFileWriter } from './vite-local-editor';

export default defineConfig({ plugins: [localEditorFileWriter(), tailwindcss(), sveltekit()] });
