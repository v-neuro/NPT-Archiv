# Color application · Corporate Design Kurzmanual 2024

Source: the user's local `_CD_Kurzmanual2024.pdf`, pages 14–15. Only color guidance is applied. The existing logo/wordmark structure, system-font stack, font sizes and typography are retained. The PDF itself is not copied to the source tree or static release.

| Manual color | RGB | CSS value | Application |
| --- | --- | --- | --- |
| Red | 174 / 22 / 19 | `#ae1613` | Sidebar, primary actions, headings, errors |
| Turquoise | 4 / 158 / 142 | `#049e8e` | Status accents, decorative elements; permitted tints for badges |
| Yellow | 244 / 194 / 69 | `#f4c245` | Warning accents and sidebar focus indication |
| Beige | 230 / 220 / 209 | `#e6dcd1` | Page backgrounds, panels, borders and permitted tints |
| Gray | 71 / 64 / 61 | `#47403d` | Body text, secondary text, neutral controls and icons |
| White | 255 / 255 / 255 | `#ffffff` | Main surfaces and text on the red sidebar/buttons |

Red is used at 100%, as specified. Other palette colors use permitted 20–100% tints; CSS tint values are sRGB mixtures with white. Disabled controls use beige/gray rather than faded red. Body/status text uses gray to maintain contrast; turquoise and yellow are accents rather than small text on white.

All application and PDF-viewer colors share `src/palette.css`. No external font or logo asset was introduced. Default/active navigation labels and the wordmark are checked against their actual computed backgrounds with a minimum text contrast of 4.5:1. The tested white-on-red and red-on-white contrast is approximately 7.18:1. Gray body text on the beige-20 background is approximately 9.58:1.
