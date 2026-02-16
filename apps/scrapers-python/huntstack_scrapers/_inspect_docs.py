import os
import psycopg2
from dotenv import load_dotenv

# Load environment variables
env_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', '.env')
load_dotenv(env_path)

DATABASE_URL = os.getenv('DATABASE_URL')

def print_section(title, content):
    print(f"\n{'='*80}")
    print(f"{title}")
    print(f"{'='*80}")
    print(content)
    print(f"{'='*80}\n")

def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # 1. NM: Migratory Game Bird - NMDGF
    print("\n" + "="*80)
    print("1. NEW MEXICO: 'Migratory Game Bird - NMDGF'")
    print("="*80)
    cur.execute("""
        SELECT d.id, d.title, LENGTH(d.content) as len
        FROM documents d
        JOIN states s ON d.state_id = s.id
        WHERE s.code = 'NM' 
        AND d.title = 'Migratory Game Bird - NMDGF'
    """)
    row = cur.fetchone()
    if row:
        doc_id, title, content_len = row
        print(f"Document ID: {doc_id}")
        print(f"Title: {title}")
        print(f"Content length: {content_len} chars")
        
        cur.execute("SELECT content FROM documents WHERE id = %s", (doc_id,))
        content = cur.fetchone()[0]
        
        print_section("CHARS 0-2000:", content[0:2000])
        print_section("CHARS 8000-16000:", content[8000:16000])
    else:
        print("NOT FOUND")
    
    # 2. OK: Map & Regs
    print("\n" + "="*80)
    print("2. OKLAHOMA: 'Map & Regs'")
    print("="*80)
    cur.execute("""
        SELECT d.id, d.title, LENGTH(d.content) as len
        FROM documents d
        JOIN states s ON d.state_id = s.id
        WHERE s.code = 'OK' 
        AND d.title = 'Map & Regs'
    """)
    row = cur.fetchone()
    if row:
        doc_id, title, content_len = row
        print(f"Document ID: {doc_id}")
        print(f"Title: {title}")
        print(f"Content length: {content_len} chars")
        
        cur.execute("SELECT content FROM documents WHERE id = %s", (doc_id,))
        content = cur.fetchone()[0]
        
        print_section("CHARS 0-2000:", content[0:2000])
        print_section("CHARS 8000-16000:", content[8000:16000])
    else:
        print("NOT FOUND")
    
    # 3. OK: License%Fees%
    print("\n" + "="*80)
    print("3. OKLAHOMA: License/Fees document")
    print("="*80)
    cur.execute("""
        SELECT d.id, d.title, LENGTH(d.content) as len
        FROM documents d
        JOIN states s ON d.state_id = s.id
        WHERE s.code = 'OK' 
        AND (d.title ILIKE '%License%Fees%' OR d.title ILIKE '%Licenses%Fees%')
        ORDER BY d.created_at DESC
        LIMIT 1
    """)
    row = cur.fetchone()
    if row:
        doc_id, title, content_len = row
        print(f"Document ID: {doc_id}")
        print(f"Title: {title}")
        print(f"Content length: {content_len} chars")
        
        cur.execute("SELECT content FROM documents WHERE id = %s", (doc_id,))
        content = cur.fetchone()[0]
        
        print_section("FIRST 3000 CHARS:", content[0:3000])
    else:
        print("NOT FOUND")
    
    # 4. NM: Requirements/Fees or Licenses/Permits
    print("\n" + "="*80)
    print("4. NEW MEXICO: Requirements/Fees or Licenses/Permits document")
    print("="*80)
    cur.execute("""
        SELECT d.id, d.title, LENGTH(d.content) as len
        FROM documents d
        JOIN states s ON d.state_id = s.id
        WHERE s.code = 'NM' 
        AND (
            d.title ILIKE '%Requirements%Fees%' 
            OR d.title ILIKE '%Licenses%Permits%'
            OR d.title ILIKE '%License%Permit%'
            OR d.title ILIKE '%Requirement%Fee%'
        )
        ORDER BY d.created_at DESC
        LIMIT 1
    """)
    row = cur.fetchone()
    if row:
        doc_id, title, content_len = row
        print(f"Document ID: {doc_id}")
        print(f"Title: {title}")
        print(f"Content length: {content_len} chars")
        
        cur.execute("SELECT content FROM documents WHERE id = %s", (doc_id,))
        content = cur.fetchone()[0]
        
        print_section("FIRST 3000 CHARS:", content[0:3000])
    else:
        print("NOT FOUND - Let me check what NM documents we have:")
        cur.execute("""
            SELECT d.title, LENGTH(d.content) as len 
            FROM documents d
            JOIN states s ON d.state_id = s.id
            WHERE s.code = 'NM' 
            ORDER BY d.created_at DESC
        """)
        for row in cur.fetchall():
            print(f"  - {row[0]} ({row[1]} chars)")
    
    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
