# Excel source: switch from your PC to Supabase

Use a **specific sheet** from an Excel file and store it in **Supabase** so the app reads from Supabase instead of a local file.

---

## Exact steps

### 1. Create the table in Supabase

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → your project.
2. Go to **SQL Editor** → **New query**.
3. Paste and run the contents of **`supabase/analytics_sheet_uploads.sql`** (or the SQL below).

```sql
create table if not exists public.analytics_sheet_uploads (
  sheet_name text primary key,
  data jsonb not null default '[]',
  updated_at timestamptz not null default now()
);

comment on table public.analytics_sheet_uploads is 'Excel sheet data by name. App reads from here when present.';
```

4. Run the query (e.g. **Run** or Ctrl+Enter).

---

### 2. Set env so the app can write/read

In your project root **`.env.local`** ensure you have:

- `NEXT_PUBLIC_SUPABASE_URL` = your Supabase project URL  
- `SUPABASE_SERVICE_ROLE_KEY` = your Supabase **service role** key (Project Settings → API → `service_role`)

Restart the Next.js dev server after changing env.

---

### 3. Upload using the app (specific sheet)

1. Go to **Analytics → Shot Bets** (and sign in if required).
2. In **Sheet name**, type the **exact name** of the sheet in your workbook (e.g. `Goal Tracking` or `Sheet1`).
3. Click **Choose file (.xlsx or .xlsm)** and select your Excel file.
4. The app will:
   - Read **only that sheet** from the file
   - Parse rows (columns: Shot Line, L10 Delta, HA Delta, L10 Bucket, HA Bucket, Result, Over/Under or Bet Type)
   - **Save to Supabase** in `analytics_sheet_uploads` (and optionally to `data/shot-bet-analytics.json`)

After a successful upload, the analytics tables load from **Supabase**, not from your PC or the local file.

---

### 4. How the source is chosen

- **Reading:** The app loads data from the **most recently updated** row in `analytics_sheet_uploads`. So the last sheet you uploaded (any name) is the source.
- **Writing:** Each upload upserts by **sheet name**. You can have multiple sheets in the table (e.g. "Goal Tracking", "Sheet1"); the app will use the latest upload by `updated_at`.

---

## Summary

| Step | What to do |
|------|------------|
| 1 | Run `supabase/analytics_sheet_uploads.sql` in Supabase SQL Editor |
| 2 | Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`, restart dev server |
| 3 | In Analytics → Shot Bets, set **Sheet name** and upload your Excel file |
| 4 | Data is stored in Supabase; the app uses it as the source from then on |

Using a **specific sheet** is supported: set "Sheet name" to that sheet’s name in the workbook before uploading.

---

## Do I still need to set an Excel path in CMD?

**No.** Once you use Supabase as the source, you don't need to point anything in CMD at an Excel file. You upload through the app (Analytics → Shot Bets), and the app reads from Supabase. There is no script in this project that expects an Excel file path in the command line.

If you **were** running something in CMD that used a path to an Excel file (e.g. another script or batch file):

1. **Preferred:** Stop using that and use the app instead: open **Analytics → Shot Bets**, set the sheet name, choose the file, and upload. Data goes to Supabase and the app uses it.
2. **If you must keep a CMD step:** Update the path inside that script/batch file to the **new** location of your Excel file (e.g. `C:\Users\You\NewFolder\your_file.xlsx`). Where that path is depends on the script (look for a variable, config file, or the first argument).

### Optional: upload from CMD using the new path

If you want to upload from the command line (e.g. to use a new path without opening the browser), you can POST the file to the upload API. Replace the path and the sheet name as needed.

**PowerShell (Windows):**

```powershell
# Set your new Excel path and sheet name
$excelPath = "C:\Users\YourName\Documents\Shot Formula_2025-26.xlsm"
$sheetName = "Goal Tracking"

# You need a session token: sign in at Analytics → Shot Bets, then in browser DevTools → Application → copy the Supabase session access_token
$token = "YOUR_SUPABASE_ACCESS_TOKEN"

Invoke-RestMethod -Uri "http://localhost:3000/api/analytics/upload" -Method Post -Form @{
  file = Get-Item -Path $excelPath
  sheet = $sheetName
} -Headers @{ Authorization = "Bearer $token" }
```

**curl (Windows CMD or Git Bash):**

```bash
curl -X POST "http://localhost:3000/api/analytics/upload" ^
  -H "Authorization: Bearer YOUR_SUPABASE_ACCESS_TOKEN" ^
  -F "file=@C:/Users/YourName/Documents/Shot Formula_2025-26.xlsm" ^
  -F "sheet=Goal Tracking"
```

Update the path to your actual Excel file. The app must be running (`npm run dev`) and you must use the session `access_token` from the app for the Bearer token.
