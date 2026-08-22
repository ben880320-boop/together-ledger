# pnpm 部署建置腳本白名單

正式部署使用 pnpm 的 `allowBuilds` 白名單，僅允許前端建置必需的 `@tailwindcss/oxide` 與 `esbuild` 執行安裝階段建置腳本。此設定取代無效的空白 `ignoredBuiltDependencies` 設定，避免雲端安裝因 `ERR_PNPM_IGNORED_BUILDS` 中止。

pnpm 官方文件指出，`pnpm approve-builds` 會將核准套件以 `true` 寫入 `pnpm-workspace.yaml` 的 `allowBuilds` map；未列出的套件仍不允許執行建置腳本。[pnpm approve-builds](https://pnpm.io/cli/approve-builds)
