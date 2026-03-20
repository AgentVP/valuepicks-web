# How to sync Excel to Supabase (from another PC)

This gets your **Goal Tracking** sheet from the workbook `Shot Formula_2025-26-1_rev goals.xlsm` into Supabase so the ValuePicks Analytics app can read it.

---

## 1. Create the table in Supabase (one-time)

In the Supabase project you use for ValuePicks:

1. Open **Dashboard** → **SQL Editor** → **New query**.
2. Paste and run this SQL (same as in `apps/analytics/supabase/analytics_sheet_uploads.sql`):

```sql
CREATE TABLE IF NOT EXISTS analytics_sheet_uploads (
  sheet_name text PRIMARY KEY,
  data jsonb NOT NULL,
  updated_at timestamptz DEFAULT now()
);

COMMENT ON TABLE analytics_sheet_uploads IS 'Excel sheet data by name. Goal Tracking from shot formula_2025-26-1_rev is the primary DB for models and results.';
```

3. Click **Run**. You should see “Success. No rows returned.”

---

## 2. On the PC where the Excel file lives

### A. Folder and files

Create a folder, e.g. `C:\Users\JM14254\nhl-importer\` (or any path you like), and put in it:

- **`import_excel_to_supabase.py`** – the script (copy from this repo: `scripts/import_excel_to_supabase.py`).
- **`.env`** – your Supabase credentials (see below).

### B. `.env` file

Create a file named **`.env`** (no filename before the dot) in the **same folder** as the script, with exactly:

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...your_service_role_secret...
```

- Use **your** Supabase project URL and **Service Role** key from: Supabase Dashboard → **Settings** → **API** (Project URL and `service_role` secret).
- **Do not** commit `.env` or share the service role key; keep it only on this PC.

### C. Python and dependencies

In that folder, in a terminal (or Command Prompt):

```bash
python -m venv .venv
.venv\Scripts\activate
pip install pandas openpyxl python-dotenv supabase
```

(On Mac/Linux use `source .venv/bin/activate` and forward slashes.)

### D. Set the Excel path

Open `import_excel_to_supabase.py` and set `EXCEL_PATH` at the bottom to your workbook path, for example:

```python
EXCEL_PATH = r"C:\Users\JM14254\nhl-importer\Shot Formula_2025-26-1_rev goals.xlsm"
```

Or leave it as-is if the path is already correct. The script uses the sheet **"Goal Tracking"** by default.

### E. Run the sync

With the venv activated:

```bash
python import_excel_to_supabase.py
```

You should see something like:

```
Reading Excel: C:\Users\...\Shot Formula_2025-26-1_rev goals.xlsm (sheet='Goal Tracking')
Loaded 1234 rows. Upserting to Supabase table 'analytics_sheet_uploads'...
Done. Sheet 'Goal Tracking' now has 1234 rows in Supabase.
```

---

## 3. Optional: use a path from the environment

Instead of editing the script each time, you can set the path in `.env`:

```env
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
EXCEL_PATH=C:\Users\JM14254\nhl-importer\Shot Formula_2025-26-1_rev goals.xlsm
```

The script will use `EXCEL_PATH` from `.env` if it’s set.

---

## 4. Re-run anytime

After you change the Excel file, run again from the same folder:

```bash
.venv\Scripts\activate
python import_excel_to_supabase.py
```

Each run **replaces** the stored "Goal Tracking" data in Supabase with the current sheet contents. The analytics app reads from this table, so it will show the latest data after you sync.

---

## Troubleshooting

| Problem | What to do |
|--------|------------|
| `FileNotFoundError` | Fix `EXCEL_PATH` in the script or in `.env` so it points to the real `.xlsm` file. |
| `Could not find the table 'analytics_sheet_uploads'` | Run the SQL in step 1 in your Supabase project. |
| `Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY` | Create `.env` in the same folder as the script with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. |
| `No module named 'supabase'` (or pandas, etc.) | Activate the venv and run `pip install pandas openpyxl python-dotenv supabase`. |
| Analytics app shows no data | Sync again; then log in to the analytics app and refresh. The app reads `analytics_sheet_uploads` where `sheet_name = 'Goal Tracking'`. |
