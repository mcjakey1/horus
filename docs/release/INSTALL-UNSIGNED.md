# Installing the Horus unsigned beta

This version of Horus is not code-signed yet. Code signing tells the operating system who made an app. Without it, Windows and macOS show a warning the first time you open Horus. This page tells you how to open Horus safely.

Before you install, make sure that your download is the file we published. Use the `SHA256SUMS` file on the release page (step 1).

Horus works offline. It has no account and sends no telemetry. It uses the internet only if you turn on Find similar: then it downloads an image model from huggingface.co one time.

## 1. Make sure the download is correct

Download `SHA256SUMS` from the release page into the same folder as the installer.

**Windows (PowerShell):**

1. Open PowerShell in the download folder.
2. Type this command:
   ```powershell
   Get-FileHash .\Horus_1.0.0_x64-setup.exe -Algorithm SHA256
   ```
3. Find the line for `Horus_1.0.0_x64-setup.exe` in `SHA256SUMS`.
4. Make sure that the two hash values are the same. Upper-case and lower-case letters are the same.

If the values are different, do not install. Download the file again.

For the `.msi` file, use its file name in the command.

**macOS (Terminal):**

1. Open Terminal in the download folder.
2. Type this command:
   ```sh
   grep -F aarch64.dmg SHA256SUMS | shasum -a 256 -c
   ```
3. Make sure that the result is `OK`.

If the result is not `OK`, do not install. Download the file again.

**Linux (terminal):**

1. Open a terminal in the download folder.
2. Type this command. Use `.deb` in place of `.AppImage` for the Debian package:
   ```sh
   grep -F .AppImage SHA256SUMS | sha256sum -c
   ```
3. Make sure that the result is `OK`.

If the result is not `OK`, do not install. Download the file again.

## 2. Windows

1. Open `Horus_1.0.0_x64-setup.exe`. You do not need administrator rights.
2. If Windows shows "Windows protected your PC", click **More info**.
3. Click **Run anyway**.
4. Follow the installer.

This warning becomes less frequent when more people download the same file.

For a managed computer, use `Horus_1.0.0_x64_en-US.msi`.

## 3. macOS

Horus for macOS is for Apple Silicon (M1 and later) only. Use `Horus_1.0.0_aarch64.dmg`. There is no version for Intel Macs.

Horus opens on macOS 11 and later. Find similar needs macOS 14 or later.

1. Open the `.dmg` file.
2. Drag **Horus** into **Applications**.

**macOS 14 and earlier:**

1. In **Applications**, Control-click **Horus**.
2. Click **Open**.
3. In the warning, click **Open** again.

**macOS 15 and later:**

1. Open **Horus** one time. macOS stops it and shows a warning.
2. Close the warning.
3. Open **System Settings**.
4. Open **Privacy & Security**.
5. Scroll down to the message about Horus.
6. Click **Open Anyway**.
7. Type your password to confirm.

You do these steps one time only. After that, Horus opens normally.

If macOS says that Horus "is damaged", do not open it. Download it again. Then do step 1 again.

## 4. Linux

**AppImage:**

1. Make the file executable:
   ```sh
   chmod +x Horus_1.0.0_amd64.AppImage
   ```
2. Open it:
   ```sh
   ./Horus_1.0.0_amd64.AppImage
   ```

**Debian or Ubuntu package:**

```sh
sudo apt install ./Horus_1.0.0_amd64.deb
```

## 5. What stays after you uninstall

Your library folder stays. Horus never deletes it. It holds your images, tags and boards.

These folders also stay. You can delete them if you do not need them:

| | Settings | Find similar model and app data | Cache |
|---|---|---|---|
| Windows | `%APPDATA%\art.horus.app` | `%LOCALAPPDATA%\art.horus.app` | `%LOCALAPPDATA%\art.horus.app` |
| macOS | `~/Library/Application Support/art.horus.app` | `~/Library/Application Support/art.horus.app` | `~/Library/Caches/art.horus.app` |
| Linux | `~/.config/art.horus.app` | `~/.local/share/art.horus.app` | `~/.cache/art.horus.app` |

The Find similar model is in the `models` folder of the app data folder. It is approximately 213 MB.

## 6. Signed builds

Signed builds will come in a later version. Then the warnings in this page will not show.
