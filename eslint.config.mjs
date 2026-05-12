import obsidianmd from 'eslint-plugin-obsidianmd';

export default [
	{
		ignores: [
			'main.js',
			'node_modules/**',
			'dist/**',
			'build/**',
			'eslint.config.mjs',
			'esbuild.config.mjs',
			'version-bump.mjs',
			'obsidian-developer-docs/**',
			'**/*.js',
		],
	},
	...obsidianmd.configs.recommended,
	{
		files: ['**/*.ts'],
		languageOptions: {
			parserOptions: {
				project: './tsconfig.json',
				tsconfigRootDir: import.meta.dirname,
			},
		},
	},
];
