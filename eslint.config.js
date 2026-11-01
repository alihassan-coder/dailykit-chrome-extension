// Lint: TypeScript best practices plus the architecture rules from ARCHITECTURE.md, enforced on every save
// and in CI. eslint-plugin-boundaries v7 (`boundaries/dependencies`, default disallow).
import js from '@eslint/js';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const PAGE_WORLD_FORBIDDEN = [
	'react',
	'react-dom',
	'react-dom/client',
	'radix-ui',
	'wxt/browser',
	'@toolbelt/ui',
	'@toolbelt/db'
];

export default tseslint.config(
	{ ignores: ['**/node_modules/**', '**/.output/**', '**/.wxt/**', 'docs/**', '**/*.d.ts'] },
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			'@typescript-eslint/consistent-type-imports': 'error',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
		}
	},
	{
		files: ['**/*.tsx'],
		plugins: { 'react-hooks': reactHooks },
		rules: reactHooks.configs.recommended.rules
	},
	{
		files: ['apps/**/*.{ts,tsx}', 'tools/**/*.{ts,tsx}', 'packages/**/*.{ts,tsx}'],
		plugins: { boundaries },
		settings: {
			'import/resolver': {
				typescript: {
					alwaysTryTypes: true,
					noWarnOnMultipleProjects: true,
					project: ['apps/*/tsconfig.json', 'tools/*/tsconfig.json', 'packages/*/tsconfig.json']
				}
			},
			'boundaries/elements': [
				{ type: 'app', pattern: 'apps/*', capture: ['app'] },
				{ type: 'tool', pattern: 'tools/*', capture: ['tool'] },
				{ type: 'core', pattern: 'packages/core' },
				{ type: 'ui', pattern: 'packages/ui' },
				{ type: 'db', pattern: 'packages/db' },
				{ type: 'wxt-kit', pattern: 'packages/wxt-kit' }
			]
		},
		rules: {
			'boundaries/dependencies': [
				'error',
				{
					default: 'disallow',
					policies: [
						// Every element may use its own files.
						{
							from: { element: { type: 'app' } },
							allow: { to: { element: { type: 'app', captured: { app: '{{from.element.captured.app}}' } } } }
						},
						{
							from: { element: { type: 'tool' } },
							allow: { to: { element: { type: 'tool', captured: { tool: '{{from.element.captured.tool}}' } } } }
						},
						{
							from: { element: { types: { anyOf: ['core', 'ui', 'db', 'wxt-kit'] } } },
							allow: { to: { element: { type: '{{from.element.type}}' } } }
						},
						// Rule 1-2: apps compose; tools use only core + ui; packages never reach up.
						{
							from: { element: { type: 'app' } },
							allow: { to: { element: { types: { anyOf: ['tool', 'core', 'ui', 'db', 'wxt-kit'] } } } }
						},
						{ from: { element: { type: 'tool' } }, allow: { to: { element: { types: { anyOf: ['core', 'ui'] } } } } },
						{
							from: { element: { types: { anyOf: ['ui', 'db', 'wxt-kit'] } } },
							allow: { to: { element: { type: 'core' } } }
						},
						// External packages are fine; rules 3-4 below narrow them per context.
						{ allow: { to: { module: { origin: 'external' } } } },
						{ allow: { to: { module: { origin: 'core' } } } }
					]
				}
			]
		}
	},
	// Rule 3: only background code may touch the database package.
	{
		files: ['apps/**/*.{ts,tsx}', 'tools/**/*.{ts,tsx}'],
		ignores: ['apps/*/entrypoints/background.ts', 'apps/*/entrypoints/background/**', 'tools/*/src/background/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{ name: '@toolbelt/db', message: 'Only background code may use the database (ARCHITECTURE.md rule 3).' }
					]
				}
			]
		}
	},
	// Rule 4: page-world code runs inside the website: no React, no extension APIs, no storage.
	{
		files: ['tools/*/src/main-world/**/*.ts', 'tools/*/src/entries/*-main.content.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: PAGE_WORLD_FORBIDDEN.map((name) => ({
						name,
						message: 'Page-world code may not use this (ARCHITECTURE.md rule 4).'
					}))
				}
			],
			'no-restricted-globals': [
				'error',
				{ name: 'chrome', message: 'No extension APIs in the page world.' },
				{ name: 'browser', message: 'No extension APIs in the page world.' }
			]
		}
	},
	// Rule 5: build-time descriptors stay plain data (imported in Node by wxt.config.ts).
	{
		files: ['tools/*/src/index.ts'],
		rules: {
			'no-restricted-globals': ['error', 'chrome', 'browser', 'window', 'document']
		}
	}
);
