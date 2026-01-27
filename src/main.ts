import { createApp } from 'vue'
import { createPinia } from 'pinia'
import 'katex/dist/katex.min.css'

import App from './App.vue'
import router from './router'
import { setupMarkdownRenderer } from './utils/markdownUtils'
import { useTheme } from './composables/useTheme'

setupMarkdownRenderer()
const { initTheme } = useTheme()
initTheme()

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
