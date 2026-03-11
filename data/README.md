# Analytics data

## Shot bets (Goal Tracking sheet)

Shot bet analytics use one row per bet. Data can be:

1. **Uploaded in the app** – On **Analytics → Shot Bets**, use **Upload Excel** and select your workbook (e.g. `Shot Formula_2025-26-1_rev goals.xlsm`). The sheet must be named **Goal Tracking**.

2. **Stored in** `shot-bet-analytics.json` – After upload, data is saved here. You can also edit or replace this file manually.

### Required columns (Goal Tracking sheet)

| Column       | Description                          | Example |
|-------------|--------------------------------------|---------|
| **Shot Line**   | Posted sportsbook line               | 28.5    |
| **L10 Delta**   | Difference from shot line (L10 model) | -1.2    |
| **HA Delta**    | Difference from shot line (H/A model) | -0.5    |
| **L10 Bucket**  | Bucket used for L10 charts          | -1      |
| **HA Bucket**   | Bucket used for H/A charts          | -0.5    |
| **Result**      | Win or loss                         | Win, 1, Loss, 0 |
| **Over/Under** or **Bet Type** | Over or under the line | Over, Under |

Column names are matched case-insensitively; spaces and underscores are equivalent (e.g. "L10 Bucket" or "L10_Bucket").

### Buckets

- **L10** charts use **L10 Bucket** for bucketing (cumulative from 0 in 0.5 steps).
- **H/A** charts use **HA Bucket** for bucketing.
- One bet row contributes to both L10 and H/A tables according to its `l10_bucket` and `ha_bucket` values.

### JSON shape (for manual edit)

```json
[
  {
    "shot_line": 28.5,
    "l10_delta": -1.2,
    "ha_delta": -0.5,
    "l10_bucket": -1,
    "ha_bucket": -0.5,
    "bet_type": "over",
    "result": "win"
  }
]
```

- `bet_type`: `"over"` or `"under"`
- `result`: `"win"` or `"loss"`
