from database import engine
from sqlalchemy import text

def run_migrations():
    print("Checking for pending migrations...")
    try:
        with engine.connect() as conn:
            # Check if owner_id exists in candidates
            try:
                # Attempt to query the column to see if it exists
                conn.execute(text("SELECT owner_id FROM candidates LIMIT 1"))
                print("Schema Check: 'owner_id' column exists in 'candidates'.")
            except Exception:
                # Column likely missing, add it
                print("Migrating: Adding 'owner_id' to candidates table...")
                try:
                    # MySQL/Postgres compatible Syntax
                    # Note: We rely on the App logic for FK integrity usually, 
                    # but strictly we should add REFERENCES users(id). 
                    # However, to avoid 'Index' issues or constraint names, we'll keep it simple first.
                    conn.execute(text("ALTER TABLE candidates ADD COLUMN owner_id INTEGER"))
                    conn.commit()
                    print("Migration successful: 'owner_id' column added.")
                except Exception as e:
                    print(f"Migration Failed: {e}")
                    
    except Exception as e:
        print(f"DB Connection Failed during migration check: {e}")

if __name__ == "__main__":
    run_migrations()
