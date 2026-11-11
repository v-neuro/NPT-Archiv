# Color application · Corporate Design Kurzmanual 2024

Source: the user's local `_CD_Kurzmanual2024.pdf`, pages 14–15. Only color guidance is applied. The existing logo/wordmark structure and system-font stack are retained. Version 0.5.0 refreshes surfaces, spacing, navigation states and interaction feedback. The PDF itself is not copied to the source tree or static release.

| Manual color | RGB | CSS value | Application |
| --- | --- | --- | --- |
| Red | 174 / 22 / 19 | `#ae1613` | Active navigation, primary actions, headings, errors |
| Turquoise | 4 / 158 / 142 | `#049e8e` | Completed steps, timeline/status accents; permitted tints for badges |
| Yellow | 244 / 194 / 69 | `#f4c245` | Warning accents and sidebar focus indication |
| Beige | 230 / 220 / 209 | `#e6dcd1` | Page backgrounds, panels, borders and permitted tints |
| Gray | 71 / 64 / 61 | `#47403d` | Body text, secondary text, neutral controls and icons |
| White | 255 / 255 / 255 | `#ffffff` | Sidebar/main surfaces and text on solid red actions |

Red is used at 100%, as specified. Other palette colors use permitted 20–100% tints; CSS tint values are sRGB mixtures with white. Disabled controls use beige/gray rather than faded red. Body/status text uses gray to maintain contrast; turquoise and yellow are accents rather than small text on white.

All application and PDF-viewer colors share `src/palette.css`. No external font or logo asset was introduced. Default/active navigation labels and the wordmark are checked against their actual computed backgrounds with a minimum text contrast of 4.5:1. The tested white-on-red and red-on-white contrast is approximately 7.18:1. Gray body text on the beige-20 background is approximately 9.58:1.

The sidebar is now white with a solid red active task, using locally defined SVG outline icons. Cards/inputs have softer corners, light beige depth, and short hover/focus/pressed feedback. Import steps mark completed stages. File drop targets highlight on drag-over. Active search/type/field/status filters have individually removable chips. The additional field filter remains collapsed by default and has a search within its archive-driven options.

Motion is limited to small transforms and an indeterminate busy indicator. Ordinary validation/typing rerenders do not trigger page entrance movement. `prefers-reduced-motion: reduce` disables animations/transitions. No red opacity/tints, external images, fonts, icon libraries, UI framework or analytics were added.

Version 0.5.1 replaces the patient dropdown with live matching results below the search/filter row. Each result is a native button with the full ID, optional existing label, examination count and latest known matching date. Selection collapses results and opens/focuses the history heading; typing reopens suggestions and clears the previous patient. Arrow keys, Enter/Space and Escape are supported. Secondary result text uses full gray for readable hover/selected contrast on turquoise-20.

Version 0.6.0 adds small separate CSV checkboxes beside session rows and patient result buttons, plus a selected-history checkbox. Checking never opens a patient/detail. Select-all explicitly names the filtered result count across pages, shows selected/hidden counts and has a clear action. Export scope is stated in one sentence; the button stays unavailable without a selection. Selected rows use turquoise-20, retaining the exact corporate palette. Measurement dropdowns share searchable numeric-performance choices; raw field names disambiguate unfamiliar or future measures.

Version 0.7.0 adds a compact mode bar (default “Nur ansehen”, explicit “Bearbeiten”, refresh/release actions), a turquoise completion receipt and persistent interruption feedback with a single connection-recheck action plus optional reselection. Technical errors remain collapsed. Completion actions lead directly to next patient/details/report; the new-patient action clears files/IDs. Single-report links and small multiple-report choosers are reused across examination list, history and receipt. Measurement dropdowns now use test-name optgroups and readable labels alongside exact source keys, preserving search by either. Hospital documents are printable standalone HTML with the same corporate base colors and no script/assets fetched.

Version 0.7.1 opens on a home screen. The original top-left wordmark is now a keyboard-accessible home button. The empty state links to library opening; the active state presents two clickable count cards with corporate turquoise accents/red numerals. Counts are library-wide and include excluded examinations, with an explicit excluded subtotal. Existing main-menu order stays unchanged.
