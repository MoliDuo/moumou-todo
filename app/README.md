# 浮窗待办 (Floating Todo Widget)

基于 `../project/Floating Todo Widget.dc.html` 设计稿实现的 Windows 桌面浮窗应用（Electron）。

## 功能

- 桌面浮窗：可拖动、可缩放、可折叠/展开，任务可增删、勾选完成、拖拽排序
- 窗口位置/大小、任务列表、折叠状态自动保存并在下次启动时恢复
- 系统托盘图标：左键显示/隐藏浮窗；右键菜单含「永久置顶」「开机自启动」勾选项和「退出」
- 取消永久置顶后，普通应用可以覆盖浮窗；使用 Win+D 显示桌面时浮窗仍保持可见且不抢焦点
- 浮窗阴影和圆角外的透明区域支持鼠标穿透，不会挡住后面的桌面或应用
- 关闭浮窗（如 Alt+F4）只是隐藏，**唯一退出方式是托盘右键菜单里的「退出」**
- 开机自启动：首次运行自动开启，可在托盘菜单里随时勾选/取消

## 开发调试

```bash
cd app
npm install
npm start
```

## 打包 Windows 安装包

在 **Windows 电脑**上执行（跨平台打包 NSIS 安装包需要 Wine，Mac/Linux 上默认没有）：

```bash
cd app
npm install
npm run dist:win
```

产物在 `dist/` 目录下：
- `浮窗待办 Setup x.x.x.exe` — 安装程序（可选安装目录、创建桌面/开始菜单快捷方式）
- `浮窗待办 x.x.x.exe` — 绿色版，双击直接运行

> 如果要在 Mac 上直接出 Windows 包，需要先 `brew install --cask wine-stable` 装好 Wine，再运行 `npm run dist:win`。

## 目录结构

```
app/
  main.js          主进程：创建浮窗窗口、托盘、开机自启、状态持久化
  preload.js       安全桥接 main <-> renderer 的 IPC
  renderer/        浮窗页面（HTML/CSS/JS，还原设计稿样式）
  build/           图标（icon.ico 应用图标 / tray.png 托盘图标）
```
