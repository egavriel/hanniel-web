# invoices/

Customer-facing invoice JPEGs, named by `invoice_no` (LH-YYMM-NNNN).

The hanniel-web pay page at `/pay/<slug>?k=<hmac>` embeds the JPEG at
`<img src=/invoices/<invoice_no>.jpg>` as the primary card, so the
customer sees the *exact same Hanniel-branded invoice image* they got
on WhatsApp when they tap the payment link.

## How a JPEG lands here

The hanniel-invoice skill step 4c runs
`scripts/commit-invoice-jpeg.sh --invoice-no <LH-YYMM-NNNN> --jpeg <path>`,
which:

1. Copies the freshly rendered JPEG from `/tmp/invoice_<customer>.jpg`
2. Stages it as `invoices/<invoice_no>.jpg`
3. Commits with message `feat(invoices): add <invoice_no> JPEG`
4. Pushes to `origin staging`

CF Pages serves the JPEG at
`https://staging.little.hanniel.co/invoices/<invoice_no>.jpg`
with `Cache-Control: public, max-age=31536000, immutable`
(set in `_headers`).

## Backfilling old invoices

For invoices generated *before* the pay page existed, the pay page
falls back gracefully to a text-only invoice card (the `<img onerror>`
handler hides the broken image and reveals a notice). If you want to
backfill the JPEG:

```bash
# If you have the original /tmp/invoice_<name>.jpg from way back
cp /tmp/invoice_shieren.jpg invoices/LH-2608-0073.jpg
git add invoices/LH-2608-0073.jpg
git commit -m "feat(invoices): backfill LH-2608-0073 JPEG"
git push origin staging
```

Otherwise, leave them — the text fallback is functional, just less pretty.

## Rotation

At ~100 invoices/month × ~50KB each = ~5MB/month. Repo is fine for years.

If size becomes a concern, run a sweep after invoice paid + 30 days:

```bash
# Pseudo: list invoices paid > 30 days ago, delete their JPEGs.
git rm invoices/$(git log --since="30 days ago" --pretty=format: --name-only invoices/ | sort -u)
git commit -m "chore(invoices): rotate paid invoices older than 30 days"
git push origin staging
```

(Tweak the date filter to match your recon workflow.)
