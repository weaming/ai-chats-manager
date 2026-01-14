import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: () => import('../views/HomeView.vue')
    },
    {
      path: '/share-preview',
      name: 'share-preview',
      component: () => import('../views/SharePreviewView.vue')
    }
  ],
})

export default router
