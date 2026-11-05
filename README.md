# dcg-extension

Browser extension that connects the DCG admin panel to a scanner on the local network. The scanner only serves plain HTTP with no CORS headers, so the admin can't call it directly; the extension forwards its requests.

## Local setup

```bash
$ yarn install
$ yarn build   # or `yarn watch`
```

Load `dist/` into the browser:

- **Chrome** - `chrome://extensions` > **Developer mode** > **Load unpacked** > `dist`.
- **Firefox** - `about:debugging#/runtime/this-firefox` > **Load Temporary Add-on...** > `dist/manifest.json`. Removed when Firefox restarts.

Then open the extension's popup and click **Allow** (Firefox opens this for you on install). After rebuilding, reload the extension and refresh the admin page.

To use the extension with the admin running locally (`admin-local.dcgstaging.co.uk`), open its popup on that site and click **Use on this site**. This works with the store-installed extension too.

**NB** The manifest sets `content_security_policy` explicitly; without it Firefox upgrades the scanner requests to HTTPS and they fail.

## Releasing

```bash
$ yarn lint
$ yarn package   # zip in web-ext-artifacts/
```
