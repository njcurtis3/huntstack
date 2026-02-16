"""Re-activate deactivated OK regulations."""
import os, psycopg2
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".env"))
conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()
cur.execute("""
    UPDATE regulations SET is_active = true
    WHERE state_id = (SELECT id FROM states WHERE code = 'OK')
    AND is_active = false
""")
print(f"Re-activated {cur.rowcount} OK regulations")
cur.execute("""
    SELECT COUNT(*) FROM regulations
    WHERE state_id = (SELECT id FROM states WHERE code = 'OK')
    AND is_active = true
""")
print(f"Total active OK regulations: {cur.fetchone()[0]}")
conn.commit()
conn.close()
