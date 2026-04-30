// @ts-nocheck
import { promises as fs } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import type { PluginOption } from 'vite';

const endpointBase = '/editor/__local-files';
const maxUploadBytes = 10 * 1024 * 1024;
const sourcePhotoDir = '/Users/ameilawattenberger/Documents/web';
const imageExtensions = new Map([
	['image/jpeg', '.jpg'],
	['image/png', '.png'],
	['image/gif', '.gif'],
	['image/webp', '.webp']
]);
const imageMimeTypes = new Map([...imageExtensions].map(([mimeType, extension]) => [extension, mimeType]));
imageMimeTypes.set('.jpeg', 'image/jpeg');

type ContentPhoto = { path: string; label: string; searchTags?: string[]; description?: string };
type ContentSection = { key: string; paragraphs: string[] };
type ContentTrigger = {
	key: string;
	sectionKey: string;
	paragraphIndex: number;
	tokenIndex: number;
	image: string;
	imageLabel: string;
};

export function localEditorFileWriter(): PluginOption {
	const root = process.cwd();
	const assetsDir = path.join(root, 'static', 'listing');
	const contentFile = path.join(root, 'src', 'lib', 'listing-content.ts');
	const sourceDir = path.resolve(sourcePhotoDir);

	return {
		name: 'local-editor-file-writer',
		apply: 'serve',
		configureServer(server) {
			server.middlewares.use(endpointBase, async (req, res, next) => {
				const url = new URL(req.url ?? '/', 'http://localhost');
				const route = url.pathname.replace(endpointBase, '') || '/';

				try {
					if (req.method === 'GET' && route === '/') {
						return sendJson(res, 200, {
							enabled: true,
							assetFolder: path.relative(root, assetsDir),
							contentFile: path.relative(root, contentFile),
							sourceFolder: sourceDir,
							sourceBrowserEnabled: true
						});
					}

					if (req.method === 'GET' && route === '/source') {
						const images = await listSourceImages(sourceDir);
						return sendJson(res, 200, { sourceFolder: sourceDir, images });
					}

					if (req.method === 'GET' && route === '/source-preview') {
						return sendSourceImage(res, await resolveSourceImage(sourceDir, url.searchParams.get('path')));
					}

					if (req.method === 'POST' && route === '/source-import') {
						const rawBody = await readBody(req, maxUploadBytes);
						const payload = JSON.parse(rawBody.toString('utf8')) as { path?: unknown };
						const imported = await importSourceImage(sourceDir, String(payload.path ?? ''), assetsDir);
						return sendJson(res, 200, imported);
					}

					if (req.method === 'POST' && route === '/upload') {
						const uploaded = await saveUploadedImage(req, url.searchParams.get('name'), assetsDir);
						return sendJson(res, 200, uploaded);
					}

					if (req.method === 'POST' && route === '/content') {
						const rawBody = await readBody(req, maxUploadBytes);
						const payload = JSON.parse(rawBody.toString('utf8')) as {
							photos?: unknown;
							sections?: unknown;
							triggers?: unknown;
						};
						const photos = asPhotoArray(payload.photos);
						const sections = asSectionArray(payload.sections);
						const triggers = asTriggerArray(payload.triggers);
						await fs.writeFile(contentFile, buildListingContent(photos, sections, triggers), 'utf8');
						return sendJson(res, 200, { ok: true, contentFile: path.relative(root, contentFile) });
					}

					next();
				} catch (error) {
					const message = error instanceof Error ? error.message : 'Unknown local editor error';
					sendJson(res, 400, { ok: false, message });
				}
			});
		}
	};
}

async function saveUploadedImage(req: IncomingMessage, requestedName: string | null, assetsDir: string) {
	const mimeType = String(req.headers['content-type'] ?? '').split(';')[0];
	const fallbackExtension = imageExtensions.get(mimeType);
	const extension = path.extname(requestedName ?? '').toLowerCase() || fallbackExtension;

	if (!fallbackExtension || !extension || !['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(extension)) {
		throw new Error('Only JPG, PNG, GIF, and WebP image uploads are allowed.');
	}

	const basename = sanitizeBasename(path.basename(requestedName ?? `dropped-image${extension}`, extension));
	await fs.mkdir(assetsDir, { recursive: true });
	const filePath = await uniqueAssetPath(assetsDir, basename, extension);
	await fs.writeFile(filePath, await readBody(req, maxUploadBytes));
	const fileName = path.basename(filePath);
	const label = titleize(basename);

	return { path: `/listing/${fileName}`, label, fileName };
}

async function listSourceImages(sourceDir: string) {
	const images: { name: string; relativePath: string; previewPath: string; modifiedAt: string }[] = [];

	async function visit(dir: string) {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.startsWith('.')) continue;
			const fullPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				await visit(fullPath);
				continue;
			}

			if (!entry.isFile() || !isImageFile(entry.name)) continue;
			const stats = await fs.stat(fullPath);
			const relativePath = path.relative(sourceDir, fullPath);
			images.push({
				name: entry.name,
				relativePath,
				previewPath: `${endpointBase}/source-preview?path=${encodeURIComponent(relativePath)}`,
				modifiedAt: stats.mtime.toISOString()
			});
		}
	}

	await visit(sourceDir);
	return images.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
}

async function importSourceImage(sourceDir: string, relativePath: string, assetsDir: string) {
	const sourcePath = await resolveSourceImage(sourceDir, relativePath);
	const extension = path.extname(sourcePath).toLowerCase();
	const basename = sanitizeBasename(path.basename(sourcePath, extension));
	await fs.mkdir(assetsDir, { recursive: true });
	const filePath = await uniqueAssetPath(assetsDir, basename, extension);
	await fs.copyFile(sourcePath, filePath);
	const fileName = path.basename(filePath);

	return { path: `/listing/${fileName}`, label: titleize(basename), fileName };
}

async function resolveSourceImage(sourceDir: string, relativePath: string | null) {
	const normalizedPath = path.normalize(String(relativePath ?? ''));
	const fullPath = path.resolve(sourceDir, normalizedPath);
	const relativeToSource = path.relative(sourceDir, fullPath);

	if (!relativeToSource || relativeToSource.startsWith('..') || path.isAbsolute(relativeToSource)) {
		throw new Error('Source image path must stay inside the configured source folder.');
	}

	if (!isImageFile(fullPath)) throw new Error('Only JPG, PNG, GIF, and WebP source images are allowed.');
	await fs.access(fullPath);
	return fullPath;
}

async function sendSourceImage(res: ServerResponse, filePath: string) {
	const extension = path.extname(filePath).toLowerCase();
	res.statusCode = 200;
	res.setHeader('Content-Type', imageMimeTypes.get(extension) ?? 'application/octet-stream');
	res.setHeader('Cache-Control', 'no-store');
	res.end(await fs.readFile(filePath));
}

function isImageFile(filePath: string) {
	return imageMimeTypes.has(path.extname(filePath).toLowerCase());
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
	res.statusCode = status;
	res.setHeader('Content-Type', 'application/json');
	res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, maxBytes: number) {
	const chunks: Buffer[] = [];
	let bytes = 0;

	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		bytes += buffer.byteLength;
		if (bytes > maxBytes) throw new Error('Upload is too large. Keep files under 10MB.');
		chunks.push(buffer);
	}

	return Buffer.concat(chunks);
}

async function uniqueAssetPath(assetsDir: string, basename: string, extension: string) {
	let suffix = 0;
	while (true) {
		const fileName = `${basename}${suffix ? `-${suffix + 1}` : ''}${extension}`;
		const filePath = path.join(assetsDir, fileName);
		try {
			await fs.access(filePath);
			suffix += 1;
		} catch {
			return filePath;
		}
	}
}

function sanitizeBasename(name: string) {
	return (name || 'dropped-image').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dropped-image';
}

function titleize(value: string) {
	return value.replace(/[-_]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function asPhotoArray(value: unknown): ContentPhoto[] {
	if (!Array.isArray(value)) throw new Error('Expected photos to be an array.');
	return value.map((photo) => {
		if (!photo || typeof photo !== 'object') throw new Error('Invalid photo entry.');
		const item = photo as Record<string, unknown>;
		const contentPhoto: ContentPhoto = { path: String(item.path ?? ''), label: String(item.label ?? '') };
		const searchTags = Array.isArray(item.searchTags)
			? item.searchTags.map(String).filter(Boolean)
			: [];
		if (searchTags.length) contentPhoto.searchTags = searchTags;
		if (typeof item.description === 'string' && item.description.trim()) {
			contentPhoto.description = item.description.trim();
		}
		return contentPhoto;
	});
}

function asSectionArray(value: unknown): ContentSection[] {
	if (!Array.isArray(value)) throw new Error('Expected sections to be an array.');
	return value.map((section) => {
		if (!section || typeof section !== 'object') throw new Error('Invalid section entry.');
		const item = section as Record<string, unknown>;
		return {
			key: String(item.key ?? ''),
			paragraphs: Array.isArray(item.paragraphs) ? item.paragraphs.map(String) : []
		};
	});
}

function asTriggerArray(value: unknown): ContentTrigger[] {
	if (!Array.isArray(value)) throw new Error('Expected triggers to be an array.');
	return value.map((trigger) => {
		if (!trigger || typeof trigger !== 'object') throw new Error('Invalid trigger entry.');
		const item = trigger as Record<string, unknown>;
		return {
			key: String(item.key ?? ''),
			sectionKey: String(item.sectionKey ?? ''),
			paragraphIndex: Number(item.paragraphIndex ?? 0),
			tokenIndex: Number(item.tokenIndex ?? 0),
			image: String(item.image ?? ''),
			imageLabel: String(item.imageLabel ?? '')
		};
	});
}

function toTsArray(value: unknown) {
	return JSON.stringify(value, null, '\t').replace(/"([^"\\]+)":/g, '$1:');
}

function buildListingContent(photos: ContentPhoto[], sections: ContentSection[], triggers: ContentTrigger[]) {
	return `export type PhotoChoice = {\n\tpath: string;\n\tlabel: string;\n\tsearchTags?: readonly string[];\n\tdescription?: string;\n};\n\nexport type LetterSection = {\n\tkey: string;\n\tparagraphs: readonly string[];\n};\n\nexport type PhotoTrigger = {\n\tkey: string;\n\tsectionKey: string;\n\tparagraphIndex: number;\n\ttokenIndex: number;\n\timage: string;\n\timageLabel: string;\n};\n\nexport const availablePhotos = ${toTsArray(photos)} as const satisfies readonly PhotoChoice[];\n\nexport const letterSections = ${toTsArray(sections)} as const satisfies readonly LetterSection[];\n\nexport const photoTriggers = ${toTsArray(triggers)} as const satisfies readonly PhotoTrigger[];\n\nexport type SectionKey = (typeof letterSections)[number]['key'];\nexport type PhotoTriggerKey = (typeof photoTriggers)[number]['key'];\n\nexport function splitReadableText(paragraph: string) {\n\treturn paragraph.split(/(\\s+)/).filter(Boolean);\n}\n\nexport function isSectionKey(value: string | undefined): value is SectionKey {\n\treturn letterSections.some((section) => section.key === value);\n}\n\nexport function isPhotoTriggerKey(value: string | undefined): value is PhotoTriggerKey {\n\treturn photoTriggers.some((trigger) => trigger.key === value);\n}\n`;
}
