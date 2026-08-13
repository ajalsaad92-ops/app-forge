# Plan: Implement AI Service Layer & Diff View for App-Forge

Implementing a service layer for LLM communication (Gemini), a secure API configuration panel, refactoring logic, and a code diff view.

## User Review Required

> [!IMPORTANT]
> - The application will use an LLM API (Google Gemini by default).
> - You will need to provide your own API key in the configuration panel within the app.
> - The API key will be stored in your browser's local storage for privacy.

## Proposed Changes

### Configuration & Service Layer
- **API Config Panel**: Add a settings modal/panel to input and store the Gemini API key in `localStorage`.
- **LLM Service**: Implement a client-side service to communicate with Google Gemini API (or via a server function if preferred for security, but user requested `localStorage` storage for the key).
- **Refactor Function**: Implement `analyzeCode(code, userInstruction)` to send code and instructions to the LLM and return refactored code.

### Editor & Workspace Enhancements
- **Automatic Updates**: Automatically update the Monaco Editor content with the refactored code after analysis.
- **Diff View**: Integrate `@monaco-editor/react`'s `DiffEditor` component.
- **Toggle Mechanism**: Add a toggle in the header to switch between the standard editor and the diff view.

### Technical Details
- **Gemini API Integration**: Use `fetch` to call Google's Generative AI API directly from the client (since the key is stored client-side).
- **State Management**:
  - `apiKey`: Loaded from `localStorage`.
  - `originalCode`: Stored when starting a refactor to enable diffing.
  - `viewMode`: `'editor' | 'diff'`.
- **UI Components**:
  - `SettingsModal`: For API key input.
  - `DiffEditor`: For comparing original vs. refactored code.

## Execution Plan
1. **Gemini Integration**: Create `src/lib/gemini.ts` for direct API communication.
2. **Settings UI**: Add a settings dialog to `src/routes/editor.tsx` to manage the API key.
3. **Refactor Logic**: Update the "Analyze" button or chat to trigger the refactoring process.
4. **Diff View Implementation**: Add the `DiffEditor` component and the toggle logic to the main workspace.
5. **Auto-update Editor**: Ensure the active file state is updated with the AI's response.
