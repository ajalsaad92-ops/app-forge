# Plan - Build App-Forge AI Code Analyzer

Transform the current application into **App-Forge**, a modern, AI-powered code analysis workspace. The app will feature a dark-themed, developer-centric IDE layout.

## User Interface & Features

- **App-Forge Branding**: Update the application name and theme to a professional dark-mode IDE aesthetic.
- **Sidebar (File Management)**: 
    - Implement a clean sidebar to manage a virtual file system.
    - Support adding new files and deleting existing ones.
    - Track "active" file state to sync with the editor.
- **Main Workspace (Split View)**:
    - **Code Editor**: Integrate Monaco Editor for professional-grade syntax highlighting and editing.
    - **AI Chat Interface**: A side-by-side chat panel for interacting with the AI about the current code.
- **Analysis Engine**:
    - Add an "Analyze" button to trigger code review.
    - Implement a server function placeholder to simulate AI processing.
- **Responsive Layout**: Ensure the three-pane layout (Sidebar | Editor | Chat) works smoothly across desktop screen sizes.

## Technical Details

- **Editor**: `@monaco-editor/react` for the code editing experience.
- **State Management**: React `useState` and `useEffect` to manage the virtual file tree and editor content.
- **Styling**: Tailwind CSS for the dark theme and responsive grid/flex layout.
- **Server Logic**: TanStack `createServerFn` for the analysis endpoint placeholder.
- **Components**: shadcn/ui for consistent, high-quality interface elements (Buttons, Inputs, Scroll Areas).

## Implementation Steps

1. **Update Root & Global Styles**: Ensure a consistent dark theme across the entire app.
2. **Create File System Logic**: Implement the utility for managing the virtual file tree.
3. **Build the Workspace Layout**: Set up the 3-column grid (Sidebar, Editor, Chat).
4. **Integrate Monaco Editor**: Configure syntax highlighting and theme.
5. **Implement Chat & Analysis UI**: Build the message list and analysis trigger.
6. **Connect Server Function**: Create the `analyzeCode` function to handle the "Analyze" request.
7. **Final Polish**: Refine animations, responsive behavior, and developer-centric visuals.
