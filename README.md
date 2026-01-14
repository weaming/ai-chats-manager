# AI Chats

这是一个基于 Vue 3 + Vite 开发的本地 AI 对话管理工具。主要用于管理、查看、编辑和分享（生成图片）本地的对话记录。

## 快速上手

### 1. 环境准备
确保已安装 Node.js。

### 2. 安装与运行
```bash
# 安装依赖
npm install

# 启动开发服务
npm run dev
```

### 3. 构建部署
```bash
# 类型检查
npm run type-check

# 打包构建
npm run build
```

## 使用说明

- **根目录权限**：首次加载时，需要授予浏览器访问本地文件夹的权限。
- **文件结构**：项目依赖特定的文件结构（自动管理），请勿随意手动修改 `chats` 和 `markdown` 目录下的文件名引用，以免破坏关联。
- **浏览器推荐**：强烈建议使用 Chrome 或 Edge 等 Chromium 内核浏览器，以获得最完善的 File System Access API 支持。
