# Plan - App-Forge Codebase Consolidation

Consolidate the heavily duplicated `src/routes/editor.tsx` file into a clean, unified architecture while preserving all functionality (multi-AI providers, IndexedDB persistence, APK processing, and Environment Setup Guide).

## Proposed Changes

### Frontend Consolidation (`src/routes/editor.tsx`)

1.  **State Unification**: Merge duplicate state declarations for `files`, `chatMessages`, `aiSettings`, `viewMode`, and others. Use a single source of truth for the workspace.
2.  **Logic Deduplication**: Consolidate overlapping event handlers like `sendChatMessage`, `handleEditorChange`, and `renderTree`.
3.  **UI Layout Cleanup**: Reconstruct the sidebar and main editor area to remove duplicated JSX blocks.
4.  **Effect Stabilization**: Ensure `useEffect` hooks for initialization and persistence are correctly ordered and handle race conditions.
5.  **Path Resolution**: Fix any broken relative imports or missing dependencies.

### Technical Details

- **Workspace State**: Use the existing `FileSystemItem` interface.
- **Persistence**: Maintain `idb-keyval` for IndexedDB storage using `STORAGE_KEY`.
- **AI Integration**: Use the existing `ai-service.ts` factory for multi-provider support.
- **APK Logic**: Continue using `apk-processor.ts` for in-browser extraction/building.
- **Setup Bridge**: Keep the health-check and auto-verify logic for the local Node.js bridge.

## Verification Plan

### Build & Static Analysis
- Run `bun run build` to ensure no syntax errors or type regressions.
- Verify no linting warnings in the consolidated file.

### Functional Testing
- **APK Upload**: Verify APK extraction and file tree population.
- **AI Chat**: Test different providers and ensure the diff view triggers on code actions.
- **Persistence**: Refresh the page and confirm the workspace and settings are restored from IndexedDB.
- **Setup Modal**: Confirm the environment guide correctly pings the local backend.
