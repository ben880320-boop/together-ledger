# GitHub Actions Run #9 — v1.2.1 Release Automation

- Workflow page: https://github.com/ben880320-boop/together-ledger/actions/workflows/android-apk.yml
- Run page: https://github.com/ben880320-boop/together-ledger/actions/runs/32040496161
- Commit: `aa98e4166376080ace4988851584ec370710a536`
- Commit message: `feat: improve ledger UX and publish APK releases automatically`
- Initial status observed: **In progress** on `main`.
- Status rechecked after roughly ten minutes: **In progress**; no artifact is available yet. The run remains accessible at the URL above.

## Expected validation path

1. Restore the mobile source archive and build the standalone `assembleRelease` APK.
2. Verify `assets/index.android.bundle`, `versionName=1.2.0`, and `versionCode=2`.
3. Upload the Actions artifact, create `app-release.apk.sha256`, then create or update the GitHub Release tag `v1.2.0`.
4. Upload `app-release.apk` and `app-release.apk.sha256` as Release assets.
