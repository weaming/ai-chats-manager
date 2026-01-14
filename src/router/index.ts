import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/:pathMatch(.*)*',
      name: 'home',
      component: { template: '<div></div>' } // Dummy component to satisfy router
    }
  ],
})

export default router
