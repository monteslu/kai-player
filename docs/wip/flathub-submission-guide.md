# Flathub Submission Guide for Loukai

## Files Created

The following files have been created for Flathub submission:

1. **com.loukai.app.yml** - Flatpak manifest (build instructions)
2. **com.loukai.app.desktop** - Desktop entry file
3. **com.loukai.app.metainfo.xml** - AppStream metadata (descriptions, screenshots)

## Prerequisites

Before submitting, you need:

### 1. Generate npm dependency sources

Flathub builds in a sandboxed environment without network access, so you need to pre-download all npm dependencies:

```bash
# Install flatpak-builder and flatpak-node-generator
flatpak install flathub org.flatpak.Builder
npm install -g flatpak-node-generator

# Generate sources for main package
flatpak-node-generator npm package-lock.json -o generated-sources.json

# Generate sources for web UI
cd src/web
flatpak-node-generator npm package-lock.json -o ../../generated-sources-web.json
cd ../..

# You may need to merge these or reference both in the manifest
```

### 2. Add screenshots

Create a `screenshots/` directory with:
- `player.png` - Main player interface
- `mixer.png` - Audio mixer view

These will be displayed on Flathub's app page.

### 3. Update the manifest

In `com.loukai.app.yml`, update:
- `tag: v1.0.0` - Your actual release tag
- `commit: COMMIT_HASH_HERE` - The git commit hash for that tag

## Testing Locally

Before submitting, test the Flatpak build:

```bash
# Install flatpak-builder
sudo apt install flatpak-builder

# Add Flathub repo
flatpak remote-add --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo

# Install Electron base app and SDK
flatpak install flathub org.electronjs.Electron2.BaseApp//23.08
flatpak install flathub org.freedesktop.Sdk//23.08
flatpak install flathub org.freedesktop.Sdk.Extension.node18//23.08

# Build the Flatpak
flatpak-builder --force-clean build-dir com.loukai.app.yml

# Install and test locally
flatpak-builder --user --install --force-clean build-dir com.loukai.app.yml

# Run it
flatpak run com.loukai.app
```

## Submission Process

1. **Fork the Flathub repository**
   ```bash
   git clone https://github.com/flathub/flathub.git
   cd flathub
   git checkout -b add-loukai
   ```

2. **Create your app repository**
   - Go to https://github.com/flathub
   - Click "New repository"
   - Name: `com.loukai.app`
   - Make it public

3. **Add your files to the new repo**
   ```bash
   git clone https://github.com/flathub/com.loukai.app.git
   cd com.loukai.app

   # Copy the manifest files
   cp /path/to/kai-player/com.loukai.app.yml .
   cp /path/to/kai-player/com.loukai.app.desktop .
   cp /path/to/kai-player/com.loukai.app.metainfo.xml .
   cp /path/to/kai-player/generated-sources.json .

   git add .
   git commit -m "Initial Loukai submission"
   git push
   ```

4. **Submit to Flathub**
   - Go back to your fork of `flathub/flathub`
   - Add a line to `README.md`: `com.loukai.app`
   - Create a Pull Request
   - In the PR description, explain what your app does

5. **Review process**
   - Flathub maintainers will review your submission
   - They'll test the build and check for issues
   - Address any feedback/requested changes
   - Once approved, your app goes live!

## Common Issues

- **Build failures**: Usually due to missing dependencies in generated-sources.json
- **Permissions**: Too broad permissions (like `--filesystem=host`) will be rejected
- **Icons**: Must be in the correct location and format
- **AppStream validation**: Run `appstream-util validate com.loukai.app.metainfo.xml`

## Updates

After your app is on Flathub, to release updates:

1. Tag a new version in your repo: `git tag v1.1.0`
2. Update `com.loukai.app.yml` in the Flathub repo with new tag/commit
3. Create a PR to Flathub repo
4. Flathub will automatically build and publish updates

## Resources

- Flathub submission guide: https://github.com/flathub/flathub/wiki/App-Submission
- Flatpak docs: https://docs.flatpak.org/
- AppStream metadata: https://www.freedesktop.org/software/appstream/docs/