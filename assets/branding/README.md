# Repository branding

The README uses the approved monochrome pixel LB in light/dark `picture`
sources, followed by the LAB-HARNESS name. `pixel-lb-light.svg` is near-black
(#080808); `pixel-lb-dark.svg` is near-white (#FAFAFA). Both have transparent
backgrounds and six separately editable tile paths on a 24×32 integer grid.
The 72×96 display size keeps each module at exactly three CSS pixels.

The pixel silhouette derives from the original six LAB-BAWUAH tile paths,
retaining the 3:4 proportions, L stem and foot, B lobes and internal divisions.
Curves become stepped contours and gutters occupy at least one grid module;
this is a pixel adaptation, not identical canonical geometry. Use integer
multiples of 24×32, with a recommended minimum height of 32px.
Source and output hashes are recorded under `pixelLB` in `PROVENANCE.json`.
The original `terminal-b-*.svg` assets remain the sources for the terminal UI.

`social-preview.png` is the repository-owned 1280×640 social preview: canonical B,
LAB-HARNESS and a short terminal-harness descriptor. It has safe margins and a
neutral grayscale palette. It is not a personal or organization avatar. Uploading
it to GitHub repository settings is separate from committing this asset.

`social-preview.svg` is the vector source; `social-preview.html` is self-contained
and requires no repository-private package, font bundle or network request. The
published PNG was rasterized with T3's `html_preview` at width1280; its measured
content/screenshot height was640. Renderer: HeadlessChrome154.0.8037.92 on macOS.
Visual inspection confirmed geometry, text, margins and contrast. Pixel inspection
confirmed every RGB pixel is grayscale. Exact source/image hashes are in
`PROVENANCE.json` and the publication manifest.

To reproduce, render `social-preview.html` in a Chromium browser at1280×640 CSS
pixels and device scale1. T3 can call `html_preview` with the file's full HTML and
`width:1280`, then save the returned PNG. With an already-installed Chromium,
an equivalent headless capture is:

```sh
"$CHROMIUM_PATH" --headless --force-device-scale-factor=1 --hide-scrollbars \
  --window-size=1280,640 --screenshot="$PWD/assets/branding/social-preview.png" \
  "file://$PWD/assets/branding/social-preview.html"
```

Supply the executable path locally. Browser/system font versions can change text
rasterization; no font is redistributed and no universal byte-identical rendering
is claimed. Review any regenerated pixels, dimensions and source hashes before an
explicit publication-manifest refresh. User authorization covers use of the
owner's mark in this repository; no general reuse license is granted.
