import { ref, computed } from 'vue';

// Static imports for curated themes to guarantee availability
import atomOneLight from 'highlight.js/styles/atom-one-light.css?inline';
import atomOneDark from 'highlight.js/styles/atom-one-dark.css?inline';
import github from 'highlight.js/styles/github.css?inline';
import githubDark from 'highlight.js/styles/github-dark.css?inline';
import base16Atlas from 'highlight.js/styles/base16/atlas.css?inline';
import pandaLight from 'highlight.js/styles/panda-syntax-light.css?inline';
import stackoverflowLight from 'highlight.js/styles/stackoverflow-light.css?inline';
import xcode from 'highlight.js/styles/xcode.css?inline';
import nord from 'highlight.js/styles/nord.css?inline';
import intellijLight from 'highlight.js/styles/intellij-light.css?inline';

// Use import.meta.glob to find ALL available themes as string content (?inline)
// Try absolute-from-root and relative paths for robustness across different Vite setups
const allThemeModules = {
    ...import.meta.glob('/node_modules/highlight.js/styles/**/*.css', { 
        query: '?inline',
        import: 'default'
    }),
    ...import.meta.glob('../../node_modules/highlight.js/styles/**/*.css', { 
        query: '?inline',
        import: 'default'
    })
};

const staticThemeMap: Record<string, any> = {
    'atom-one-light.css': atomOneLight,
    'atom-one-dark.css': atomOneDark,
    'github.css': github,
    'github-dark.css': githubDark,
    'base16/atlas.css': base16Atlas,
    'panda-syntax-light.css': pandaLight,
    'stackoverflow-light.css': stackoverflowLight,
    'xcode.css': xcode,
    'nord.css': nord,
    'intellij-light.css': intellijLight,
};

const curatedThemeList = [
    { name: 'Atom One Dark', value: 'atom-one-dark.css' },
    { name: 'Atom One Light (推荐)', value: 'atom-one-light.css' },
    { name: 'Base16 Atlas', value: 'base16/atlas.css' },
    { name: 'GitHub Dark', value: 'github-dark.css' },
    { name: 'GitHub Light (经典)', value: 'github.css' },
    { name: 'IntelliJ Light', value: 'intellij-light.css' },
    { name: 'Nord (北极光)', value: 'nord.css' },
    { name: 'Panda Light (清新)', value: 'panda-syntax-light.css' },
    { name: 'StackOverflow Light (高对比)', value: 'stackoverflow-light.css' },
    { name: 'Tomorrow (柔和)', value: 'base16/tomorrow.css' },
    { name: 'Xcode', value: 'xcode.css' },
].sort((a, b) => a.name.localeCompare(b.name));

// Helper to normalize paths for matching
const normalizePath = (p: string) => {
    return p.replace('/node_modules/highlight.js/styles/', '')
            .replace('../../node_modules/highlight.js/styles/', '');
};

// Helper to get friendly name (remove .css and capitalize)
const formatThemeName = (path: string) => {
    return path.replace('.css', '').replace(/-/g, ' ').split('/').pop() || path;
};

const currentTheme = ref('atom-one-light.css');
const showAllThemes = ref(false);

const updateStyleTag = (cssContent: string) => {
    let styleTag = document.getElementById('hljs-theme-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'hljs-theme-style';
        document.head.appendChild(styleTag);
    }
    styleTag.textContent = cssContent;
};

const updateState = (themeName: string) => {
    currentTheme.value = themeName;
    localStorage.setItem('hljs-theme-preference', themeName);
};

export function useTheme() {
    
    const availableThemes = computed(() => {
        // Map of known names from curated list
        const nameMap = new Map(curatedThemeList.map(t => [t.value, t.name]));

        if (!showAllThemes.value) {
            // Check if currentTheme is in curated list
            const isCurated = curatedThemeList.some(t => t.value === currentTheme.value);
            if (!isCurated) {
                // If not curated, but currently selected, we MUST include it to avoid blank select box
                return [...curatedThemeList, { name: formatThemeName(currentTheme.value), value: currentTheme.value }]
                    .sort((a, b) => a.name.localeCompare(b.name));
            }
            return curatedThemeList;
        }
        
        // Return full list from glob
        const allPaths = Object.keys(allThemeModules);
        if (allPaths.length === 0) {
            // Fallback to curated if glob fails
            return curatedThemeList;
        }

        const all = allPaths
            .filter(path => !path.endsWith('.min.css'))
            .map(path => {
                const value = normalizePath(path);
                const name = nameMap.get(value) || value.replace('.css', ''); 
                return { name, value };
            })
            // Unique by value (since multiple globs might match same thing)
            .filter((v, i, a) => a.findIndex(t => (t.value === v.value)) === i)
            .sort((a, b) => a.name.localeCompare(b.name));
            
        return all;
    });

    const applyTheme = async (themeName: string) => {
        if (themeName.startsWith('disabled')) return;
        
        // 1. Static Map
        if (staticThemeMap[themeName]) {
             updateStyleTag(staticThemeMap[themeName]);
             updateState(themeName);
             return;
        }

        // 2. Dynamic Glob
        const fullKey = `../../node_modules/highlight.js/styles/${themeName}`;
        const loader = allThemeModules[fullKey];

        if (!loader) {
            console.error(`Theme not found: ${themeName}`);
            return;
        }

        try {
            const cssContent = await loader() as string;
            updateStyleTag(cssContent);
            updateState(themeName);
        } catch (e) {
            console.error('Failed to load theme:', e);
        }
    };

    const initTheme = () => {
        const saved = localStorage.getItem('hljs-theme-preference');
        if (saved) {
            applyTheme(saved);
        } else {
            // Apply a default theme if nothing is saved
            applyTheme('atom-one-light.css');
        }
    };

    return {
        availableThemes,
        currentTheme,
        showAllThemes,
        applyTheme,
        initTheme,
    };
}
