# Geese With Teeth: iPhone-first 3D asset pipeline

The current browser game remains the playable iPhone build. This pipeline prepares portable 3D assets for the web game and for a possible future Unreal Engine project; it does **not** run Unreal Editor or Blender on iOS.

## iPhone workflow
1. Use Safari to open the GitHub repository and this branch.
2. Obtain or create original/licensed models in **GLB/glTF 2.0** for web preview. Preserve original **BLEND** source files when available.
3. Upload small GLB assets to `assets/3d/models/`, textures to `assets/3d/textures/`, and animations to `assets/3d/animations/` using GitHub's Add file > Upload files on Safari (request desktop site if needed).
4. Add a row to `assets/3d/manifest.json` with a unique id, asset path, source/license, intended use, and status. Do not claim an asset is game-ready until tested.
5. Use a browser-based glTF viewer to inspect the GLB on iPhone. Verify scale, orientation, materials, animation and performance before wiring it into gameplay.
6. For Unreal Engine, export FBX from Blender on a desktop/cloud machine when necessary, import there, and test skeletons/materials/collisions. GLB alone is not a guarantee of Unreal compatibility.

## Naming and quality
- Use lowercase kebab-case names such as `goose-player-v01.glb`.
- For web assets, target modest triangle counts, compact textures, and compressed files. Test on an actual iPhone.
- Store source and usage rights. Avoid copyrighted third-party characters and likenesses without permission.
- Large binary assets may need Git LFS; check GitHub file limits before uploading.
- Never commit credentials, API keys, or proprietary third-party models without rights.

## Proposed first milestones
1. Player goose placeholder GLB.
2. Idle, walk, run, attack animation set.
3. Weapon pickup models (visual assets only).
4. iPhone 3D preview page.
5. Optional Unreal project scaffold once an editor-capable computer is available.

## Important
This branch is preparation only. Do not replace or break the existing iPhone game. A remote PC/cloud workstation is required to operate the actual Blender/Unreal editors.
