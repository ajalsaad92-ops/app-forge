# Plan - Client-side APK Processing Integration

We will transition the APK editor from a simulated UI to a functional prototype that processes APK files in the browser using `jszip` for decompression and resource manipulation.

## Proposed Changes

### 1. Dependencies
- Add `jszip` to `package.json` for in-browser APK extraction.

### 2. APK Processing Logic (`src/lib/apk-processor.ts`)
- Create a client-side utility to:
    - Load a `.apk` file (which is a ZIP) into memory.
    - Extract file structure and contents.
    - Update specific files in the ZIP archive.
    - Generate a new modified `.apk` file for download.

### 3. UI Integration (`src/routes/editor.tsx`)
- Update `handleUpload` to use a real `<input type="file">` and process the uploaded APK.
- Update the sidebar to display the actual file tree from the ZIP.
- Enable the "Build & Sign" button to re-package the ZIP.
- Enable the "Download" button to trigger a browser download of the modified file.

### 4. SMALI and Resources (Prototype)
- Provide a text-based editor for SMALI files and XML resources directly from the ZIP.

## Technical Details
- **APKTool/Smali:** Since these require a Java runtime, we will focus on raw file editing (XML, Smali, Assets). For deep Smali recompilation, an external API or WASM-based smali tool would be needed in a future phase.
- **Signing:** We will provide a "mock" signing step that re-packages the ZIP. Actual APK signing (v2/v3) requires specific crypto libraries; for this phase, we'll focus on the packaging logic.
