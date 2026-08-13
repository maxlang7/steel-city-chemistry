# Steel City Chemistry — event website

One-page site for **Steel City Chemistry: Past, Present, and Future**, an ACS150 anniversary
celebration presented by the ACS Pittsburgh Local Section.
Saturday, October 3, 2026 · William Pitt Union, University of Pittsburgh.

Built from Ronghong Lin's Aug 8, 2026 brief and the poster-themed Word mockup.

## Layout

```
site/                  ← the entire published website
  index.html           all page content
  styles.css           palette + layout
  main.js              nav, scroll-spy, speaker filter (~90 lines, no dependencies)
  assets/img/          hero art, ACS logos, favicon, social card
  assets/speakers/     drop speaker headshots here
  assets/organizers/   drop organizer headshots here
  assets/sponsors/     drop sponsor logos here
_source/               poster art at full resolution + the original .docx mockups
netlify.toml           publish config and cache headers
```

No build step, no dependencies, no framework. Open `site/index.html` in a browser and it works.

### Local preview

```sh
cd site && python3 -m http.server 8765   # then open http://localhost:8765
```

## Filling in what's still pending

Everything unresolved is marked with an uppercase `PENDING` or `VERIFY` comment in `index.html`.
Search for `PENDING` to find them all.

**Registration / poster / sponsor links.** Three CTAs are deliberately inert. For each one:
set the real `href`, delete `is-pending` and `aria-disabled="true"`, and delete the
`<em class="btn__note">…</em>` line. They appear in the header, hero, their own section, and the
final CTA band — update every instance (search for the `data-cta` attribute).

**Headshots.** Every person currently shows an initials monogram. Replace the span:

```html
<span class="avatar avatar--mono" aria-hidden="true">RH</span>
```

with an image, keeping the `avatar` class:

```html
<img class="avatar" src="assets/speakers/hernandez.jpg" alt="" width="160" height="160" loading="lazy">
```

Square images, 400×400 or larger; they're cropped to a circle. `alt=""` is correct here — the
person's name is already adjacent text, so a description would be read twice by a screen reader.

**Sponsor logos.** Replace the wordmark `<span>` inside each `.logo` with an `<img>` and wrap it in
a link to the sponsor's site. Tier sizing is automatic.

**Industry keynote.** A dashed "To be announced" card holds the slot. Replace it with a normal
speaker card once the acceptance lands — do not list an unconfirmed name as confirmed.

## Open items for Ronghong

Blocking before launch:

1. Registration URL, and whether registration is open yet
2. Poster submission URL + abstract deadline, poster size/format, check-in procedure
3. Sponsorship inquiry contact (person, email, or form)
4. Speaker headshots and short bios (16 speakers) + organizer headshots (4 co-chairs)
5. Sponsor logo files and each sponsor's website URL
6. **"SACSP" is verbatim from the mockup and is almost certainly a typo** — likely SSP and/or SACP.
   Confirm the correct name and whether it is one logo or two.
7. Whether CMU (Gold) and Duquesne (Silver) are actually committed — the first mockup lists neither
8. Formal organizer wording: are Pitt / CMU / Duquesne co-hosts, or program partners?
9. Event contact email for the footer

Content decisions already made (from the poster-theme mockup, which supersedes the first draft):

- Poster awards: 18 awards totaling $825, plus free one-year ACS membership for the first 50
  accepted presenters. (The earlier draft's "$2,500 planned" is not used.)
- Student eligibility includes high school.
- Confirmed sponsors: Platinum PPG + SACSP; Gold Pitt + CMU; Silver Duquesne.

## Notes

- **Brand assets are official.** The ACS logo and ACS150 mark were extracted from the mockup
  document, not recreated. Check whether ACS national brand review applies to a local-section page.
- **Hero image** is a crop of the event poster with the baked-in text removed, so the headline is
  real DOM text — selectable, translatable, and readable by screen readers. Source art in `_source/`.
- **Performance:** hero ships as WebP at three widths (34–127 KB) with a JPEG fallback.
- **Accessibility:** skip link, semantic headings in order, visible focus states, keyboard-operable
  nav and filters, `scroll-margin-top` so anchors clear the sticky header. Gold is used only for
  large text and UI accents — never small body copy — because gold-on-navy fails contrast at
  body sizes.
- **Print stylesheet** included; the page prints as a clean agenda.

## ⚠ Before launch: re-enable search indexing

This preview is deliberately hidden from search engines. **Two things must be removed** once
Ronghong approves, or the live site will never appear in Google:

1. the `<meta name="robots" content="noindex, nofollow">` tag in `index.html`
2. `site/robots.txt` (delete the file, or change `Disallow: /` to `Disallow:`)

## Deploying

Netlify, publish directory `site`. Either drag the `site/` folder onto app.netlify.com/drop, or
connect this directory as a repo — `netlify.toml` already sets the publish dir and cache headers.
