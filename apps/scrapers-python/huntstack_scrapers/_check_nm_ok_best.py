import os
import psycopg2
from dotenv import load_dotenv

# Load environment variables
env_path = r"c:\Users\natha\Desktop\repos\huntstack\.env"
load_dotenv(env_path)

DATABASE_URL = os.getenv("DATABASE_URL")

def find_best_license_docs(state_code):
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
    print(f"{state_name} ({state_code}) - Best Documents for License Extraction")
    print(f"{'='*80}\n")
    
    scored_docs = []
    
    for doc_id, title, doc_type, url, content in docs:
        if not content:
            continue
        
        content_lower = content.lower()
        score = 0
        keywords_found = []
        
        # High-value keywords
        if 'license' in content_lower:
            count = content_lower.count('license')
            score += count * 5
            keywords_found.append(f"license({count})")
        
        if 'permit' in content_lower:
            count = content_lower.count('permit')
            score += count * 3
            keywords_found.append(f"permit({count})")
        
        if 'stamp' in content_lower:
            count = content_lower.count('stamp')
            score += count * 4
            keywords_found.append(f"stamp({count})")
        
        if 'fee' in content_lower or '$' in content_lower:
            fee_count = content_lower.count('fee')
            dollar_count = content_lower.count('$')
            score += (fee_count + dollar_count) * 2
            keywords_found.append(f"fee/$(fee:{fee_count}, $:{dollar_count})")
        
        if 'price' in content_lower:
            count = content_lower.count('price')
            score += count * 2
            keywords_found.append(f"price({count})")
        
        # Season/bag limit keywords (lower priority)
        if 'season' in content_lower:
            count = content_lower.count('season')
            score += count
            keywords_found.append(f"season({count})")
        
        if 'bag limit' in content_lower:
            count = content_lower.count('bag limit')
            score += count * 2
            keywords_found.append(f"bag_limit({count})")
        
        if score > 0:
            scored_docs.append({
                'id': doc_id,
                'title': title,
                'type': doc_type,
                'url': url,
                'size': len(content),
                'score': score,
                'keywords': ', '.join(keywords_found)
            })
    
    # Sort by score
    scored_docs.sort(key=lambda x: x['score'], reverse=True)
    
    print(f"Top 10 documents by relevance score:\n")
    
    for i, doc in enumerate(scored_docs[:10], 1):
        print(f"{i}. {doc['title'][:70]}")
        print(f"   Score: {doc['score']}, Type: {doc['type']}, Size: {doc['size']:,} chars")
        print(f"   Keywords: {doc['keywords']}")
        print(f"   URL: {doc['url']}")
        print(f"   Doc ID: {doc['id']}")
        print()
    
    cur.close()
    conn.close()

def main():
    print("HuntStack NM and OK - Best Documents for License Extraction")
    print("=" * 80)
    
    find_best_license_docs("NM")
    find_best_license_docs("OK")
    
    print("\n" + "=" * 80)
    print("ANALYSIS COMPLETE")
    print("=" * 80)

if __name__ == "__main__":
    main()
