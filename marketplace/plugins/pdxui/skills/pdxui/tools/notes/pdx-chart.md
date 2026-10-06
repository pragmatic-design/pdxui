**Use it when** a dashboard or a detail page shows a trend, a comparison or a share. **Not when** it is a
tiny inline trend in a table cell or a KPI card → `pdx-sparkline`.

**Pitfalls**
- `series-config` is a JSON **string**, not an object. A malformed string is dropped in silence and the chart
  draws as if it were not there.
- The `currency` format is USD unless you set `currency="EUR"`.
- With no `height` the canvas takes a 16:9 ratio of its width: set `height` in a short card.
- The legend is drawn only with two or more items, and never for a gauge.
- Numbers print in `locale`, else the nearest `lang` attribute, else the browser's: set one of the first two.

**Composes with** `pdx-card` / `pdx-statistic` (the KPIs above the charts, recipes: *Dashboard*) ·
`pdx-data-source` / `createDataSource` (`:source`, repainted when the source's `data()` changes).
