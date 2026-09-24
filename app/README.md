# 哞哞清单 (Floating Todo Widget)

基于 `../project/Floating Todo Widget.dc.html` 设计稿实现的 Windows 桌面浮窗应用（Electron）。

## 功能

- 桌面浮窗：可拖动、可缩放、可折叠/展开，任务可增删、勾选完成、点击文字编辑、拖拽排序（列表较长时拖到边缘会自动滚动）
- 已完成视图：点输入框右边的日历按钮切换下面的列表（输入框一直可用，在这里添加任务会自动切回任务列表），已完成的任务按打勾那天分组（今天 / 昨天 / 前天，更早的显示「9月20日 星期日」），每组显示当天总耗时；点任务右边的时长可填写耗时（`45`、`45分钟`、`1h30m`、`1小时30分`、`1:30`、`1.5h` 都行，不填算 0）；点任务文字可修改完成日期（今天 / 昨天 / 前天一键切换，或选任意一天；保留原来的时刻，不能晚于今天），鼠标悬停可看到具体完成时间
- 窗口位置/大小、任务列表、折叠状态自动保存并在下次启动时恢复；拔掉显示器或分辨率变化后，浮窗会自动回到可见区域
- 系统托盘图标：左键显示/隐藏浮窗；右键菜单含「永久置顶」「开机自启动」勾选项和「退出」
- 取消永久置顶后，普通应用可以覆盖浮窗；使用 Win+D 显示桌面时浮窗仍保持可见且不抢焦点
- 浮窗阴影和圆角外的透明区域支持鼠标穿透，不会挡住后面的桌面或应用
- 关闭浮窗（如 Alt+F4）只是隐藏，**唯一退出方式是托盘右键菜单里的「退出」**
- 开机自启动：首次运行自动开启，可在托盘菜单里随时勾选/取消（安装版和便携版都支持）
- 输入框支持中文输入法（组字时的回车不会误提交），右键有剪切/复制/粘贴菜单
- 数据保存在 `%APPDATA%\哞哞清单\store.json`，原子写入；文件损坏时会另存为 `store.json.corrupt-<时间戳>` 以便找回

## 开发调试

```bash
cd app
npm install
npm start
npm test
```

开发模式（`npm start`）的数据保存在独立的 `哞哞清单-dev` 目录，不会影响已安装版本的任务；开发模式下不会注册开机自启动。

> Electron 42 起不再在 `npm install` 时下载二进制，首次 `npm start` 时会自动下载。

## 打包 Windows 安装包

在 **Windows 电脑**上执行（跨平台打包需要 Wine）：

```bash
cd app
npm install
npm run dist:win
```

产物在 `dist/` 目录下：
- `moumou-todo-<版本>-setup-x64.exe` — 安装程序（可选安装目录、创建桌面/开始菜单快捷方式）
- `moumou-todo-<版本>-portable-x64.exe` — 便携版，双击直接运行

正式版本由 GitHub Actions 自动构建发布，见 [../.github/RELEASING.md](../.github/RELEASING.md)。

## 目录结构

```
app/
  main.js                  主进程：窗口、托盘、开机自启、IPC
  preload.js               安全桥接 main <-> renderer 的 IPC
  store.js                 状态持久化（原子写入、损坏备份、字段校验）
  window-bounds.js         窗口位置夹紧到屏幕工作区
  window-level-policy.js   置顶策略（非永久置顶时 Win+D 仍可见）
  windows-desktop-hook.js  Windows 前台窗口钩子（koffi 调用 user32）
  renderer/                浮窗页面（HTML/CSS/JS，还原设计稿样式）
    layout.js              主进程与页面共享的尺寸常量
    history.js             已完成视图的按天分组、日期标签与换算、耗时解析/格式化
    fonts/                 本地打包的 Figtree 字体（SIL OFL）
  build/                   图标：icon.ico（应用 + Windows 托盘）、tray.png/tray@2x.png、
                           icon-source.png 为源图，gen_icons.py 重新生成
  test-support/            渲染进程测试用的假 DOM
```
