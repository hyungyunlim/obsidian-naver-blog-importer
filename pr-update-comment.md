Hi @Zachatoo,

Thank you for the follow-up review! You're absolutely right - I've now properly addressed all the points:

## ✅ Fixes in v1.2.3

### 1. **Notice Handling** 
- ✅ Now uses `const messageEl = (cancelNotice as any).messageEl;` directly as suggested
- No more DOM queries that could accidentally target other plugins' notices

### 2. **Settings Text**
- ✅ Changed "AI settings" → "AI" (removed "settings" from heading)
- ✅ Completely removed the unused `title: 'Naver blog importer settings'` line from translations

### 3. **Release Tag Format**
- ✅ Created new release with correct tag: `1.2.3` (without the 'v' prefix)
- Previous release was `v1.2.2`, new one is properly tagged as `1.2.3`

## 📦 New Release

- **Release**: [1.2.3](https://github.com/hyungyunlim/obsidian-naver-blog-importer/releases/tag/1.2.3)
- **Latest commit**: [2ad188a](https://github.com/hyungyunlim/obsidian-naver-blog-importer/commit/2ad188a)

All feedback has been implemented exactly as requested. The plugin builds successfully and follows all Obsidian guidelines.

Thank you for your patience and thorough review!