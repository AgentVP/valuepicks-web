"""
Sync Excel "Goal Tracking" sheet to Supabase for ValuePicks Analytics.
Table: analytics_sheet_uploads (sheet_name, data jsonb). Analytics app reads from here.
"""
import os
from pathlib import Path
from datetime import date, datetime

import pandas as pd
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()
SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

TABLE_NAME = "analytics_sheet_uploads"
SHEET_NAME = "Goal Tracking"


def normalize_value(v):
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, pd.Timestamp):
        return v.to_pydatetime().isoformat()
    if isinstance(v, float) and pd.isna(v):
        return None
    return v


def import_excel(path: str, sheet: str) -> None:
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Excel file not found: {file_path}")

    print(f"Reading Excel file: {file_path}")
    df = pd.read_excel(file_path, sheet_name=sheet, engine="openpyxl")

    # Build list of row dicts for analytics_sheet_uploads.data (what the app expects)
    rows = []
    for _, row in df.iterrows():
        raw = row.to_dict()
        row_dict = {str(k): normalize_value(v) for k, v in raw.items()}
        rows.append(row_dict)

    print(f"Loaded {len(rows)} rows. Upserting to Supabase table {TABLE_NAME!r}...")
    payload = {"sheet_name": SHEET_NAME, "data": rows}
    supabase.table(TABLE_NAME).upsert(payload, on_conflict="sheet_name").execute()
    print(f"Done. Sheet {SHEET_NAME!r} now has {len(rows)} rows in Supabase.")


if __name__ == "__main__":
    EXCEL_PATH = r"C:\Users\JM14254\nhl-importer\Shot Formula_2025-26-1_rev goals.xlsm"
    SHEET_NAME = "Goal Tracking"
    import_excel(EXCEL_PATH, SHEET_NAME)
