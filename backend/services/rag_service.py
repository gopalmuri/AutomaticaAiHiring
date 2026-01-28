import re
import os
import pypdf
import requests
import json
from pathlib import Path
from dotenv import load_dotenv
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type
import requests

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent

# RAG Service Optimized for Low-Memory Environments (Render Free Tier)
# Removed ChromaDB and SentenceTransformer to save RAM.
# Uses direct text context passing to LLM.

class RAGService:

    @staticmethod
    def extract_text_from_pdf(file_path):
        text = ""
        try:
            with open(file_path, 'rb') as f:
                reader = pypdf.PdfReader(f)
                for page in reader.pages:
                    text += page.extract_text() + "\n"
        except Exception as e:
            print(f"Error reading PDF: {e}")
            return ""
        return text

    @staticmethod
    def extract_candidate_info(text, filename=""):
        info = {
            "name": "Unknown Candidate",
            "email": None
        }
        
        print(f"DEBUG: --- Starting Extraction for {filename} ---")
        
        # 1. Regex Email
        email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
        email_match = re.search(email_pattern, text)
        if email_match:
            info["email"] = email_match.group(0)

        # 2. Heuristic Name
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        for i in range(min(5, len(lines))):
            potential_name = lines[i]
            if (1 <= len(potential_name.split()) <= 4 and 
                len(potential_name) < 50 and 
                "@" not in potential_name and
                not any(char.isdigit() for char in potential_name)):
                
                info["name"] = potential_name.title()
                break

        # 3. AI Fallback
        if not info["email"] or info["name"] == "Unknown Candidate":
            try:
                header_text = text[:3000]
                ai_extracted = RAGService.extract_with_llm(header_text)
                
                if ai_extracted.get("name") and ai_extracted["name"] not in ["Unknown", "Null", None]:
                    info["name"] = ai_extracted["name"]
                if ai_extracted.get("email") and not info["email"]:
                    info["email"] = ai_extracted["email"]
            except Exception as e:
                print(f"DEBUG: AI Failed: {e}")

        # 4. Filename Fallback
        if info["name"] in ["Unknown Candidate", "Resume", "Cv", "Curriculum Vitae"] and filename:
            base = os.path.splitext(filename)[0]
            clean_name = base.replace("_", " ").replace("-", " ").title()
            clean_name = re.sub(r'\bresume\b|\bcv\b|\bprofile\b', '', clean_name, flags=re.IGNORECASE).strip()
            if clean_name:
                info["name"] = clean_name

        return info

    @staticmethod
    def extract_with_llm(text_chunk):
        """
        Uses Groq to parse structured contact info from raw text.
        """
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key: 
            return {}

        try:
            return RAGService._inner_extract_with_llm(text_chunk, api_key)
        except Exception as e:
            print(f"DEBUG: Groq Extraction Exception: {e}")
            return {}

    @staticmethod
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        retry=retry_if_exception_type(requests.exceptions.HTTPError)
    )
    def _inner_extract_with_llm(text_chunk, api_key):
        prompt = f"""
        Extract the **Candidate Name** and **Email Address** from the text below.
        If email is not found, return null.
        If name is not found, return null.
        
        TEXT:
        {text_chunk}
        
        OUTPUT JSON ONLY:
        {{
            "name": "Full Name",
            "email": "email"
        }}
        """
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        url = "https://api.groq.com/openai/v1/chat/completions" 
        payload = {
            "messages": [
                {"role": "system", "content": "You are a data extraction assistant. Output valid JSON only."},
                {"role": "user", "content": prompt}
            ],
            "model": "llama-3.1-8b-instant",
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }
        
        response = requests.post(url, headers=headers, json=payload, timeout=15)
        response.raise_for_status()
        
        if response.status_code == 200:
            content = response.json()['choices'][0]['message']['content']
            return json.loads(content)
        
        return {}

    @staticmethod
    def ingest_resume(user_id, resume_id, file_path):
        """
        Low-memory version: Does NOT store vectors locally.
        We rely on passing the text context directly to the LLM during screening.
        """
        # No-op for vector DB ingestion to save RAM
        return resume_id

    @staticmethod
    def screen_resume(jd_text, resume_id, resume_context=""):
        """
        Screens resume using passing text directly.
        """
        # 0. Validate JD
        clean_jd = jd_text.strip()
        if len(clean_jd) < 15:
             return {
                "score": 0, 
                "reasoning": "Job Description is too short.", 
                "key_skills_match": [],
                "missing_skills": []
            }

        # If resume_context is missing, we can't query vector DB anymore.
        # We assume the caller might have passed the resume text, or we just rely on what we have.
        # For this optimized version, we really need the Resume Text content to be passed in resume_context.
        # If it's missing, we try to degrade gracefully.
        if not resume_context:
             # In a real heavy-db scenario, we'd query DB. 
             # Here we assume the frontend/controller sends the text or we accept low context.
             resume_context = "Resume content not available in memory optimization mode."

        # Call Groq API
        api_key = os.getenv("GROQ_API_KEY")
        return RAGService.call_groq_api(jd_text, resume_context, api_key)

    @staticmethod
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=10),
        retry=retry_if_exception_type(requests.exceptions.HTTPError)
    )
    def call_groq_api(jd, resume_context, api_key):
        if not api_key:
            return {"score": 0, "reasoning": "Missing API Key", "key_skills_match": [], "missing_skills": []}
            
        # Truncate context to fit in token limit if necessary (Llama 3 has 128k context so 25k chars is fine)
        prompt = f"""
        Act as a Senior Technical Recruiter evaluation engine.
        
        JOB DESCRIPTION:
        {jd}
        
        CANDIDATE RESUME:
        {resume_context[:25000]} 
        
        TASK:
        Evaluate the candidate against the Job Description using the basic scoring rubric.
        
        OUTPUT REQUIREMENTS:
        - Return a precise integer Total Score (0-100).
        - Provide component scores.
        - List matched and missing skills.
        - Generate a normalized "extracted_role".
        - Provide a short 2-3 line explanation.
        
        Return STRICT JSON only:
        {{
            "score": (0-100 integer),
            "component_scores": {{
                "skills": (0-40),
                "experience": (0-25),
                "projects": (0-20),
                "education": (0-10),
                "bonus": (0-5)
            }},
            "key_skills_match": ["Skill A", "Skill B"],
            "missing_skills": ["Skill X", "Skill Y"],
            "reasoning": "Reasoning...",
            "extracted_role": "Job Title"
        }}
        """
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        try:
            url = "https://api.groq.com/openai/v1/chat/completions" 
            payload = {
                "messages": [
                    {"role": "system", "content": "You are a helpful and accurate recruitment assistant. You only output valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                "model": "llama-3.1-8b-instant",
                "temperature": 0.1,
                "response_format": {"type": "json_object"}
            }
            
            response = requests.post(url, headers=headers, json=payload)
            response.raise_for_status() 
            
            data = response.json()
            content = data['choices'][0]['message']['content']
            
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                content = content.replace("```json", "").replace("```", "").strip()
                return json.loads(content)
            
        except Exception as e:
            print(f"Groq API Error: {e}")
            return {
                "score": 0, 
                "reasoning": f"AI Analysis Failed: {str(e)}",
                "key_skills_match": [],
                "missing_skills": []
            }
