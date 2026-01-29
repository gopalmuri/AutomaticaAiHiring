import requests
import json
import time

BASE_URL = "https://automaticaaihiring.onrender.com"

def test_assign():
    url = f"{BASE_URL}/api/assessments/assign/"
    
    # Payload with Hardcoded Questions (Bypassing AI) to test DB/Email logic
    payload = {
        "candidates": [{"name": "Test User", "email": "gopalmuri2004@gmail.com"}],
        "type": "aptitude",
        "config": {
            "description": "Test skipping AI",
            "generated_questions": [
                {"id": 1, "question": "1+1?", "options": ["1", "2", "3", "4"], "correct": 1}
            ]
        },
        "deadline": "2026-02-01"
    }
    
    print(f"Testing ASSIGNMENT at: {url}")
    try:
        response = requests.post(url, json=payload, timeout=30)
        print(f"Status Code: {response.status_code}")
        print(f"Response Body: {response.text}")
        
        if response.status_code == 200:
            print("✅ SUCCESS: Assignment logic works (DB + Email + CORS-backend)")
        else:
            print("❌ FAILED: Backend still returning error.")
            
    except Exception as e:
        print(f"Request Failed: {e}")

if __name__ == "__main__":
    test_assign()
