Hi @Zachatoo,

Thank you so much for your thorough review! 🙏

I've addressed all the feedback points and just released **v1.2.2** with the fixes:

## ✅ Changes Made

### 1. **UI Text Capitalization**
- ✅ Changed all UI text to use sentence case
- ✅ "Select Folder" → "Select folder"
- ✅ "AI Configuration" → "AI settings" (also removed the word "Configuration")
- ✅ Applied to all modals, settings, and notice messages

### 2. **Code Quality Improvements**
- ✅ Replaced all `any` types with proper TypeScript types
- ✅ Added proper type imports for `NaverBlogPlugin` in all modal components
- ✅ Fixed the Notice element access (removed the deprecated API usage)

### 3. **API Compliance**
- ✅ **Vault API**: Switched from `adapter.exists()` to `getAbstractFileByPath()`
- ✅ **Vault API**: Changed `adapter.writeBinary()` to `createBinary()`
- ✅ **Frontmatter**: Now using `getFrontMatterInfo()` for parsing frontmatter

### 4. **Network Headers**
- ✅ Removed all unnecessary `User-Agent` headers from requests
- ✅ Removed `Referer` headers
- ✅ Now using clean `requestUrl()` API calls

### 5. **Other**
- ✅ `fundingUrl` was already absent from manifest.json
- ✅ `main.js` is properly gitignored
- ✅ Version bumped to **1.2.2**

## 📦 New Release

I've created a new release with all these changes:
- **Release**: [v1.2.2](https://github.com/hyungyunlim/obsidian-naver-blog-importer/releases/tag/v1.2.2)
- **Commit**: [16ab22b](https://github.com/hyungyunlim/obsidian-naver-blog-importer/commit/16ab22b)

The plugin now builds successfully without any TypeScript errors and follows all Obsidian plugin guidelines.

Thank you again for taking the time to review this plugin. Your feedback has been invaluable in improving the code quality! 

Please let me know if there's anything else that needs adjustment.