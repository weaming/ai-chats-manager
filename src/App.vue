<template>
  <router-view />
</template>

<style>
/* Global styles */
:root {
  --border-color: #dee2e6;
  --background-color: #f8f9fa;
  --text-color: #212529;
  --primary-color: #007bff;
  --resizer-width: 4px;
}

html, body {
  height: 100vh;
  width: 100vw;
  margin: 0;
  padding: 0;
  overflow: hidden; /* Prevent body scroll */
  position: fixed; /* 强制固定,防止任何滚动 */
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  background-color: var(--background-color);
  color: var(--text-color);
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh; /* Full viewport height */
}

#app.is-resizing {
  cursor: col-resize;
  user-select: none;
}

.app-header {
  flex-shrink: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 2rem;
  background-color: #fff;
  border-bottom: 1px solid var(--border-color);
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
}

.app-header h1 {
  margin: 0;
  font-size: 1.5rem;
  color: var(--primary-color);
}

.new-btn {
  padding: 8px 15px;
  border: 1px solid var(--primary-color);
  background-color: transparent;
  color: var(--primary-color);
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s, color 0.2s;
}

.new-btn:hover {
  background-color: var(--primary-color);
  color: #fff;
}

.app-container {
  display: flex;
  flex-grow: 1;
  padding: 1.5rem;
  overflow: hidden;
  min-height: 0;
}

.sidebar {
  flex-shrink: 0;
  display: flex; /* Allow child to fill height */
}

.resizer {
  flex-shrink: 0;
  width: var(--resizer-width);
  cursor: col-resize;
  background-color: var(--border-color);
  margin: 0 1rem;
  border-radius: 2px;
  transition: background-color 0.2s;
}
.resizer:hover {
    background-color: var(--primary-color);
}

.main-content {
  flex-grow: 1;
  min-width: 0; /* Allow content to shrink */
  display: flex; /* Allow child to fill height */
}

/* Make direct children of sidebar/main-content fill height */
.sidebar > *,
.main-content > * {
    width: 100%;
    height: 100%;
}
</style>
