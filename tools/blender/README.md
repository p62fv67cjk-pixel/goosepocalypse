# Cloud Blender build (iPhone-friendly)

This GitHub Actions workflow runs **real Blender** on GitHub's Linux runner, without installing Blender on an iPhone. It creates a .blend source and .glb model and offers both as a downloadable workflow artifact.

After merging:
1. Open repository > **Actions** > **Build Blender Goose Assets**.
2. Tap **Run workflow** and select main.
3. Open the completed run and download **goose-with-teeth-3d-assets** (a ZIP containing the .blend and .glb files).
4. Preview the GLB in a compatible web viewer or import it into a 3D editor.

This is a static original model; idle/walk/attack motion in the separate Goose Lab preview is procedural and is **not** baked into this export.

## Unreal Engine
The GLB is an interchange asset, **not** a connected Unreal project. Unreal Editor and packaging require an Unreal-capable computer/cloud workstation with the engine installed and an appropriate license. GitHub-hosted runners do not include Unreal Engine. No Unreal cloud instance has been provisioned or billed.

Existing iPhone game files are untouched.
