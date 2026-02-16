import os
import psycopg2
from dotenv import load_dotenv

# Load environment variables
env_path = r"c:\Users\natha\Desktop\repos\huntstack\.env"
load_dotenv(env_path)

DATABASE_URL = os.getenv("DATABASE_URL")

# Keywords to search for
LICENSE_KEYWORDS = ["license", "permit", "fee", "price", "$", "stamp"]
SEASON_KEYWORDS = ["season", "bag limit", "bag limits", "daily bag"]

def analyze_state_summary(state_code):
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    # Get state info
    cur.execute("SELECT id, name FROM states WHERE code = %s", (state_code,))
    state_row = cur.fetchone()
    
    if not state_row:
        print(f"State {state_code} not found")
        cur.close()
        conn.close()
        return
    
    state_id, state_name = state_row
    
    # Get documents
    cur.execute("""
        SELECT id, title, document_type, source_url, content
        FROM documents
        WHERE state_id = %s
        ORDER BY created_at DESC
    """, (state_id,))
    
    docs = cur.fetchall()
    
    print(f"\n{'='*80}")
    print(f"{state_name} ({state_code}) - {len(docs)} documents")
    print(f"{'='*80}\n")
    
    if not docs:
        print(f"No documents found\n")
        cur.close()
        conn.close()
        return
    
    license_docs = []
    season_docs = []
    
    for doc_id, title, doc_type, url, content in docs:
        has_license = False
        has_season = False
        
        if content:
            content_lower = content.lower()
            found_license = [kw for kw in LICENSE_KEYWORDS if kw in content_lower]
            found_season = [kw for kw in SEASON_KEYWORDS if kw in content_lower]
            
            if found_license:
                has_license = True
                license_docs.append({
                    'id': doc_id,
                    'title': title,
                    'type': doc_type,
                    'url': url,
                    'keywords': found_license,
                    'size': len(content)
                })
            
            if found_season:
                has_season = True
                season_docs.append({
                    'id': doc_id,
                    'title': title,
                    'type': doc_type,
                    'url': url,
                    'keywords': found_season,
                    'size': len(content)
                })
    
    print(f"Documents with LICENSE keywords: {len(license_docs)}/{len(docs)}")
    for doc in license_docs[:5]:  # Show top 5
        print(f"  - {doc['title'][:60]}")
        print(f"    Type: {doc['type']}, Size: {doc['size']:,} chars")
        print(f"    URL: {doc['url']}")
        print(f"    Keywords: {', '.join(doc['keywords'])}")
    
    if len(license_docs) > 5:
        print(f"  ... and {len(license_docs) - 5} more")
    
    print(f"\nDocuments with SEASON keywords: {len(season_docs)}/{len(docs)}")
    for doc in season_docs[:5]:  # Show top 5
        print(f"  - {doc['title'][:60]}")
        print(f"    Type: {doc['type']}, Size: {doc['size']:,} chars")
        print(f"    URL: {doc['url']}")
        print(f"    Keywords: {', '.join(doc['keywords'])}")
    
    if len(season_docs) > 5:
        print(f"  ... and {len(season_docs) - 5} more")
    
    # Show documents without any keywords
    no_keyword_count = len(docs) - len(set([d['id'] for d in license_docs + season_docs]))
    if no_keyword_count > 0:
        print(f"\nDocuments without keywords: {no_keyword_count}/{len(docs)}")
    
    cur.close()
    conn.close()

def main():
    print("HuntStack NM and OK Document Summary")
    print("=" * 80)
    
    analyze_state_summary("NM")
    analyze_state_summary("OK")
    
    print("\n" + "=" * 80)
    print("SUMMARY COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    main()
