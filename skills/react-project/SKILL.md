---
name: react-project
description: Scaffolds and develops React web applications with webpack, hash routing, and pnpm. Use when building web apps, SPAs, or React projects. Don't use for mobile H5 pages, backend-only services, or non-React frameworks.
allowed_create_modes:
  - create-desktop
  - create-mobile
---
# React 项目开发规范

## 核心约束

### 技术栈限制
- **必须使用 webpack-dev-server 4.x 版本**，不能使用 5.x 版本
- **优先使用 webpack** 作为打包工具，除非用户明确要求使用其他构建工具
- **禁止使用 scss 与 sass**
- **禁止使用 esbuild 与任何二进制依赖**
- **优先使用 pnpm**
- **路由仅可使用 hash 模式**，如使用 react-router-dom 时，应使用 HashRouter
- **Meoo Cloud 云服务** 使用 Meoo Cloud 云服务作为项目的后端

## Webpack 配置规范
### 配置要求
- devServer 的 **allowedHosts** 必须设置为 `['all', '.alibaba-inc.com']`
- devServer 必须配置 **historyApiFallback** 支持 hash 路由
- HtmlWebpackPlugin 必须配置 **inject: 'body'**
- 修改 webpack 配置后必须**重启开发服务器**

## Package.json 规范

### 必须的脚本命令
```json
{
  "scripts": {
    "dev": "webpack serve",
    "build": "webpack --mode production"
  }
}
```

- 使用 `pnpm run dev` 启动开发服务器
- 使用 `pnpm run build` 构建生产环境，输出到 dist 目录

## 开发注意事项

### 路由实现和验证 (MANDATORY)
- **所有导航功能必须先实现 URL 路由**，再添加 UI 交互
- **每个 tab/页面都必须有对应的 Route 定义**
- **菜单宽度固定，确保不会被tab页面挤压或遮挡**
- **实现完成后必须进行 构建预览 验证**
- **路由结构必须记录在 AGENTS.md 中**，包含完整的 URL 映射表
- **示例路由实现**：
```jsx
import { HashRouter, Routes, Route } from 'react-router-dom';

<HashRouter>
  <Routes>
    <Route path="/" element={<Home />} />
    <Route path="/dashboard" element={<Dashboard />}>
      <Route path="analytics" element={<Analytics />} />
      <Route path="settings" element={<Settings />} />
    </Route>
  </Routes>
</HashRouter>
```

- **所有模式必须可以通过url参数进行切换**,如?theme=dark&lang=en 等等(前提是用户明确要求了要有这些模式)
- **严禁使用 Tailwind CSS 配置中未定义的颜色**

### 依赖管理
- 将所有需要的依赖添加到 package.json
- 尽量避免使用 `pnpm i <pkg>` 单独安装
- 更新 package.json 后，优先执行 `pnpm install`

### 资源引用
- 如果用户没特别约束，可以使用 **Unsplash** 的图片资源
- 如果用户没特别约束，可以使用 **FontAwesome** 的图标资源
- 禁止使用 base64 格式的图片/文件

### 前端视觉要求
- 生成的前端需要体现**设计感、规范专业、严谨和考究的细节**
- 包含尽可能多的相关功能和交互
- 添加周到的细节，如悬停状态、过渡和微交互
- 应用设计原则：层次结构、对比、平衡和动态

## React 专属最佳实践
- IMPORTANT: 必须创建标准React应用，严禁使用单HTML
- JSX语法错误导致的多次修复失败（尝试3次以上），直接重写而不是继续陷入修复的循环
- 任何文件编辑和新建之后最终交付前都要运行pnpm run dev确保没有任何编译问题
