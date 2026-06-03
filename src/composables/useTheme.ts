import { computed, ref } from 'vue'

type ThemeLoader = () => Promise<string>

const themeModules = import.meta.glob('../../node_modules/highlight.js/styles/**/*.css', {
  query: '?inline',
  import: 'default',
}) as Record<string, ThemeLoader>

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
].sort((a, b) => a.name.localeCompare(b.name))

const currentTheme = ref('atom-one-light.css')
const showAllThemes = ref(false)

const normalizePath = (path: string) => {
  return path.split('/node_modules/highlight.js/styles/').pop() || path
}

const formatThemeName = (path: string) => {
  const normalizedPath = normalizePath(path)
  return normalizedPath.replace('.css', '').replace(/-/g, ' ').split('/').pop() || normalizedPath
}

const updateStyleTag = (cssContent: string) => {
  let styleTag = document.getElementById('hljs-theme-style')
  if (!styleTag) {
    styleTag = document.createElement('style')
    styleTag.id = 'hljs-theme-style'
    document.head.appendChild(styleTag)
  }
  styleTag.textContent = cssContent
}

const updateState = (themeName: string) => {
  currentTheme.value = themeName
  localStorage.setItem('hljs-theme-preference', themeName)
}

const getThemeLoader = (themeName: string): ThemeLoader | null => {
  const matchedKey = Object.keys(themeModules).find((path) => normalizePath(path) === themeName)
  return matchedKey ? themeModules[matchedKey] || null : null
}

export function useTheme() {
  const availableThemes = computed(() => {
    if (!showAllThemes.value) {
      const isCurated = curatedThemeList.some((theme) => theme.value === currentTheme.value)
      if (isCurated) {
        return curatedThemeList
      }

      return [
        ...curatedThemeList,
        { name: formatThemeName(currentTheme.value), value: currentTheme.value },
      ].sort((a, b) => a.name.localeCompare(b.name))
    }

    const curatedNameMap = new Map(curatedThemeList.map((theme) => [theme.value, theme.name]))

    return Object.keys(themeModules)
      .filter((path) => !path.endsWith('.min.css'))
      .map((path) => {
        const value = normalizePath(path)
        return {
          name: curatedNameMap.get(value) || value.replace('.css', ''),
          value,
        }
      })
      .filter((theme, index, themes) => {
        return themes.findIndex((item) => item.value === theme.value) === index
      })
      .sort((a, b) => a.name.localeCompare(b.name))
  })

  const applyTheme = async (themeName: string) => {
    if (themeName.startsWith('disabled')) {
      return
    }

    const loader = getThemeLoader(themeName)
    if (!loader) {
      console.error(`Theme not found: ${themeName}`)
      return
    }

    try {
      const cssContent = await loader()
      updateStyleTag(cssContent)
      updateState(themeName)
    } catch (error) {
      console.error('Failed to load theme:', error)
    }
  }

  const initTheme = () => {
    const savedTheme = localStorage.getItem('hljs-theme-preference')
    applyTheme(savedTheme || 'atom-one-light.css')
  }

  return {
    availableThemes,
    currentTheme,
    showAllThemes,
    applyTheme,
    initTheme,
  }
}
