# Plan: Complete the APK Web Editor Implementation

We will transition the APK editor from a basic text editor to a robust, feature-rich web IDE for APK modification. This includes advanced file management, better manifest handling, and a cleaner user interface.

## User Review Required

> [!IMPORTANT]
> This tool performs all operations (unzipping, editing, re-zipping) locally in your browser using `JSZip`. It does not currently handle APK signing with real keys or bytecode (dex) recompilation, which normally requires a full Java/Android SDK environment. It is best suited for modifying resources (XML, assets) and manifest files.

- **Feature Preference**: Do you want a split-view mode (previewing XML changes)?
- **Visual Style**: Should the editor use a dark theme by default (VS Code style) or follow the system theme?

## Proposed Changes

### Core Logic & Processing
- **Enhanced `APKProcessor`**:
  - Add support for basic XML formatting (beautification).
  - Implement a simple search functionality across all extracted files.
  - Add file/folder creation and deletion within the virtual APK workspace.
  - Improved file type detection for Smali, Arsc, and manifest files.

### UI & Components
- **Advanced Editor Interface**:
  - Replace the standard textarea with a more capable code editor (simulated with better styling or integrating a lightweight library if possible).
  - Add tabs for open files to allow switching between multiple modified files.
  - Implement a breadcrumb navigation for the current file path.
- **Improved Sidebar**:
  - Nested folder structure (tree view) instead of a flat list.
  - Context menu for files (Rename, Delete).
- **Project Dashboard**:
  - Integrate with the existing Supabase backend to save/load "projects" (metadata and URLs to original/modified APKs).
  - Show basic APK metadata (version, package name) extracted from the manifest.

### Workflow Improvements
- **Automated Manifest Update**: Provide a UI to easily change the version code or package name without manually editing XML.
- **Build & Download**: More detailed progress logs during the rebuilding phase.

## Technical Details

- **Libraries**: Using `JSZip` for archive management and `lucide-react` for iconography.
- **State Management**: Using React state and refs for high-performance file tree rendering.
- **Data Persistence**: Storing project metadata in the `apk_projects` table in Supabase.
