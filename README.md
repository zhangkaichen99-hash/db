# DB Last-Minute Ticket Watcher

A small static browser app for saving Deutsche Bahn route watches. It lets you enter a route, activate browser notifications, saves the route automatically, and stores a generated DB booking link with every saved watch.

## Run

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Install on iPhone

Host the folder on an HTTPS site first, such as GitHub Pages, Netlify, Vercel, or your own server. An iPhone cannot use your Mac's `localhost` URL directly.

1. Open the app URL in Safari.
2. Tap the Share button.
3. Choose Add to Home Screen.
4. Open DB Watcher from the new Home Screen icon.

## Notes

- Saved routes live in the browser's `localStorage`.
- Browser notifications work while the app is open and notification permission is granted.
- iPhone installation uses PWA support. Background price checks are limited by iOS, so keep the app open when you want active checking.
- The DB booking link is generated for `bahn.de/buchung/fahrplan/suche` with station IDs from DB's station lookup endpoint when available.
- Traveller count and BahnCard selection are saved with the route and encoded into DB's traveller hash parameter.
- Exact ticket watch lets you paste a DB booking or result URL after choosing a connection on bahn.de. The app saves that exact URL, shows the current price you enter, and can remind you when that saved ticket price is at or below your target.
- DB does not publish a simple public consumer API for reliable fare polling from this page, so the app includes a local threshold checker and links to DB for the real booking flow.
