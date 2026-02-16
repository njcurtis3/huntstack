import os
import psycopg2
from dotenv import load_dotenv

# Load environment variables
env_path = r"c:\Users\natha\Desktop\repos\huntstack\.env"
load_dotenv(env_path)

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL not found in .env")
    exit(1)

# Keywords to search for
LICENSE_KEYWORDS = ["license", "permit", "fee", "price", "$", "stamp"]
SEASON_KEYWORDS = ["season", "bag limit", "bag limits", "daily bag"]

def analyze_documents(state_code, keywords_license, keywords_season):
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # First get the state_id for this state code
    cur.execute("SELECT id, name FROM states WHERE code = %s", (state_code,))
    state_row = cur.fetchone()
    
    if not state_row:
        print(f"State {state_code} not found in database")
        cur.close()
        conn.close()
        return
    
    state_id, state_name = state_row
    
    # Get all documents for the state
    cur.execute("""
        SELECT id, title, document_type, source_url, content
        FROM documents
        WHERE state_id = %s
        ORDER BY created_at DESC
    """, (state_id,))
    
    docs = cur.fetchall()
    
    print(f"\n{'='*80}")
    print(f"{state_name} ({state_code}) DOCUMENTS ({len(docs)} total)")
    print(f"{'='*80}\n")
    
    if not docs:
        print(f"No documents found for {state_code}")
        cur.close()
        conn.close()
        return
    
    for doc_id, title, doc_type, url, content in docs:
        content_len = len(content) if content else 0
        content_preview = (content[:300] + "...") if content and len(content) > 300 else (content or "")
        
        print(f"Document ID: {doc_id}")
        print(f"Title: {title}")
        print(f"Type: {doc_type}")
        print(f"URL: {url}")
        print(f"Content Length: {content_len:,} chars")
        print(f"Preview: {content_preview}")
        
        # Check for keywords
        if content:
            content_lower = content.lower()
            
            found_license = [kw for kw in keywords_license if kw in content_lower]
            found_season = [kw for kw in keywords_season if kw in content_lower]
            
            if found_license:
                print(f"  [+] License keywords found: {', '.join(found_license)}")
            if found_season:
                print(f"  [+] Season keywords found: {', '.join(found_season)}")
            
            # Count occurrences
            if found_license or found_season:
                print(f"  Keyword counts:")
                for kw in set(found_license + found_season):
                    count = content_lower.count(kw)
                    print(f"    - '{kw}': {count} occurrences")
        
        print(f"{'-'*80}\n")
    
    cur.close()
    conn.close()

def main():
    print("Checking NM and OK documents in HuntStack database...")
    print(f"DATABASE_URL: {DATABASE_URL[:50]}...")
    
    # Analyze New Mexico documents
    analyze_documents("NM", LICENSE_KEYWORDS, SEASON_KEYWORDS)
    
    # Analyze Oklahoma documents
    analyze_documents("OK", LICENSE_KEYWORDS, SEASON_KEYWORDS)
    
    print("\n" + "="*80)
    print("ANALYSIS COMPLETE")
    print("="*80)

if __name__ == "__main__":
    main()
