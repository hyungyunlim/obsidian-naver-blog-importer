# Contributing to Naver Blog Importer

Thanks for your interest in improving this plugin. Bug reports, feature ideas, and pull requests are all welcome.

## Reporting issues

- Use the [GitHub issue tracker](https://github.com/hyungyunlim/obsidian-naver-blog-importer/issues).
- Search existing issues first to avoid duplicates.
- For bugs, please include:
  - Obsidian version, OS, and plugin version
  - A minimal reproduction (the URL you tried, the exact step, expected vs. actual behaviour)
  - Console errors from `Ctrl/Cmd+Shift+I` if any

## Suggesting features

- Open a discussion or an issue describing the use case and what the import output should look like.
- Be specific about the source (Naver Blog / Cafe / News / Brunch) and the markdown shape you expect.

## Development setup

```bash
# 1. Clone and install dependencies
git clone https://github.com/hyungyunlim/obsidian-naver-blog-importer
cd obsidian-naver-blog-importer
npm install

# 2. Start the dev build (watches and rebuilds on save)
npm run dev

# 3. Symlink or copy the build output into a vault's plugins folder
#    .obsidian/plugins/naver-blog-importer/{main.js,manifest.json,styles.css}
#    `npm run build` will automatically deploy to ~/vaults/test if that path exists.

# 4. Reload Obsidian (Cmd/Ctrl+R) after each build to pick up changes.
```

## Code style

- TypeScript with strict typing — avoid `any`; prefer `unknown` + narrowing.
- Tabs for indentation (matches the existing codebase).
- Match the module layout under `src/` (`services/`, `fetchers/`, `ui/modals/`, `utils/`, `constants/`, `types/`).
- New features that touch UI must work in popout windows — use `window.setTimeout`, `createDiv`, `createFragment` from Obsidian's globals rather than raw DOM APIs.
- Localised strings go in `lang/en.json` and `lang/ko.json`, with the matching key added to `src/types/translations.ts` and `src/utils/i18n.ts`.

## Linting

This repo uses the same lint config as the Obsidian community-plugin review bot:

```bash
npm install --save-dev eslint-plugin-obsidianmd --legacy-peer-deps
npx eslint 'main.ts' 'src/**/*.ts' 'brunch-fetcher.ts' 'naver-blog-fetcher.ts'
```

PRs should land with zero errors and zero warnings.

## Pull-request checklist

- [ ] `npm run build` succeeds (TypeScript + esbuild)
- [ ] `npx eslint` reports no errors
- [ ] Manual smoke test of the affected import path inside a real vault
- [ ] Translations updated if user-visible strings changed
- [ ] `manifest.json` and `versions.json` bumped only when the release is being cut (maintainers handle this)

## Releases

Maintainers cut releases by:

1. Updating `manifest.json` `version` and `versions.json` mapping
2. Running `npm run build`
3. Creating a GitHub release with `main.js`, `manifest.json`, and `styles.css` attached as assets, tagged with the version number (no `v` prefix, matching Obsidian's convention).

## License

By submitting code you agree that your contribution will be released under the [MIT License](./LICENSE).
