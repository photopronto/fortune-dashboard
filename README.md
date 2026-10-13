# Fortune Teller dashboard

Where Photo Pronto and buyers manage fortune teller units: status, fortunes,
receipt designs, lights, events, the guest QR page, gallery and sign-ups.

Static site on GitHub Pages at https://fortuneteller.photopronto.co.uk.
Data lives in the Supabase project (tables starting `ft_`); access is
enforced by row level security, so the public key in `index.html` is safe.

- `js/main.js` - login, navigation, account picker
- `js/api.js` - every database and storage call
- `js/views/` - one file per page
- `js/receipt.js` / `js/animations.js` - same drawing rules as the unit app,
  so previews match what prints and lights up
