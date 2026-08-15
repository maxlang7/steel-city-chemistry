# Deploying

The site is hosted on Bluehost shared hosting and served at
**https://www.steelcitychemistry.com**.

GitHub Pages has been retired — this repo is version control only.

## Publish a change

From the repo root:

```sh
rsync -avz --no-perms --no-owner --no-group --omit-dir-times \
  --exclude '.well-known' --exclude 'cgi-bin' \
  site/ pittsby4@50.87.248.38:/home4/pittsby4/public_html/website_840113e7/
```

**Never add `--delete`.** The document root also contains `.well-known`
(live ACME and Cloudflare SSL validation files) and `cgi-bin`, neither of
which comes from this repo. Deleting `.well-known` would break certificate
renewal for the domain.

## What lives where on that server

| Path | What it is |
|---|---|
| `~/public_html/` | **The pittsburghacs.org WordPress site. Do not touch.** |
| `~/public_html/website_840113e7/` | Document root for steelcitychemistry.com — this site |
| `~/backups-scc/` | Pre-deployment backup of the document root |

The addon domain's document root is confirmed with:

```sh
ssh pittsby4@50.87.248.38 'uapi DomainInfo single_domain_data domain=steelcitychemistry.com'
```

## Forms

Both forms post to one Apps Script web app, which writes to two tabs of a
single spreadsheet. The script lives in `apps-script/` and is deployed with
clasp:

```sh
cd apps-script
npx -y @google/clasp@latest push -f
npx -y @google/clasp@latest deploy --deploymentId AKfycbwrkFTDmgnfayN0bySO9RkM-AvvN9EK2xHB-PzK7mMKMaCpi2drPYNk3XuykGpb80gk6Q --description "..."
```

Always update an **existing** deployment by id. Creating a new deployment
mints a new URL and loses the "Anyone" access setting, which can only be
granted through the Apps Script UI.
