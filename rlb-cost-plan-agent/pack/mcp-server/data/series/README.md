# Index series (pluggable)

Every `*.json` file here is loaded at start-up as a collection of index series; each series id becomes a value of `rebase_rate`'s `series` argument. A malformed file stops the server from starting, with the reason.

ONS output price indices are the default because they are free to use under the Open Government Licence. A firm's own tender price index can sit beside them as another file:

```json
{
  "id": "firm-tpi",
  "kind": "tender_price_index",
  "publisher": "Firm name",
  "dataset": "In-house tender price index",
  "dataset_url": "https://intranet.example/tpi",
  "released": "2026-10-01",
  "licence": "Internal use",
  "attribution": "Firm name tender price index, October 2026 release",
  "index_base": "2015=100",
  "first_month": "2014-01",
  "last_month": "2026-09",
  "caveats": ["Quarterly index, interpolated to months"],
  "series": {
    "firm_tpi": { "name": "Firm tender price index (UK)", "values": { "2014-01": 100.0, "2014-02": 100.4 } }
  }
}
```

Rules: series ids are lower case letters, digits and underscores, unique across files; every month from `first_month` to `last_month` needs a positive value. `test/core.test.js` ("pluggable series") loads a synthetic example of this shape and rebases with it.
