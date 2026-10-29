# Repository branding

The README begins with accessible light/dark `picture` sources using the approved
monochrome mesh B, followed by the LAB-HARNESS name. References are relative and
work in GitHub's README renderer. The canonical six tile paths, original gutters
and four mesh spots are preserved. No colored accent is introduced.

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
