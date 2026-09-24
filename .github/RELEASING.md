# 自动发布 Windows 版本

推送到 `main` 时，`Windows Release` 工作流先运行 `npm test`，通过后自动打包并发布 GitHub Release；也可在 Actions 页面手动运行。测试失败时不会发布。一次 push 对应一个版本，使用该 push 最后的 commit。每次推送独立运行，不取消先前构建。

发布文件：

- `moumou-todo-<版本>-setup-x64.exe`：Windows 安装包。
- `moumou-todo-<版本>-portable-x64.exe`：Windows 便携版。
- `SHA256SUMS.txt`：上述文件的 SHA-256 校验值。

版本为 `app/package.json` 中的基础版本加上该工作流的运行序号（加到 patch 位）。基础版本 `1.0.0` 对应首次 `1.0.1`、第二次 `1.0.2`，依此递增。失败的构建会占用序号，因此版本可能跳号；重新运行同一次构建沿用同一版本。主版本或次版本需要升级时，修改基础版本即可；不要降低基础版本或重建工作流以重置序号。

版本修改只发生在 CI 工作目录，安装包内部版本与 Release 标签一致，不回写仓库、不产生循环提交。上传全部成功后才公开 Release；重跑会继续未完成的草稿，已经公开的版本不会覆盖。并行构建按版本排序决定 Latest，避免旧构建后完成时覆盖最新版本。

工作流使用 GitHub 自带的 `GITHUB_TOKEN`，无需配置个人 token。仓库需要启用 Actions 并允许工作流写入 contents；保护标签的规则也需要允许创建 `v*` 标签。产物使用现有打包配置，未配置代码签名证书。
