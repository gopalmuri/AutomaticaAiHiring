from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import shutil
import os
from datetime import datetime, timedelta
import schemas, models, database
from services.rag_service import RAGService
# from .auth import get_current_user # Optional if public or protected

router = APIRouter(
    prefix="/api/resume",
    tags=["resume"]
)

import time
import concurrent.futures

def process_single_resume(file_path: str, filename: str, job_description: str, upload_dir: str):
    """
    Helper function to process a single resume:
    1. Ingest (OCR/Embed)
    2. Extract Info
    3. AI Screen (Groq)
    Returns a dict with results or error.
    Does NOT touch the DB to avoid thread safety issues.
    """
    start_time = time.time()
    result = {
        "file": filename, 
        "status": "failed", 
        "error": None,
        "score": 0,
        "reasoning": "N/A",
        "analysis": {},
        "candidate_info": {},
        "timings": {}
    }
    
    try:
        # 1. Ingest
        t0 = time.time()
        resume_id = f"temp_{filename}"
        user_id = 1 
        RAGService.ingest_resume(user_id, resume_id, file_path)
        t1 = time.time()
        result["timings"]["ingest"] = t1 - t0
        
        # 2. Extract & Screen
        full_text = RAGService.extract_text_from_pdf(file_path)
        candidate_info = RAGService.extract_candidate_info(full_text, filename)
        result["candidate_info"] = candidate_info
        result["full_text"] = full_text
        
        # 3. Screen (Pass full_text directly)
        t2 = time.time()
        analysis = RAGService.screen_resume(job_description, resume_id, full_text)
        t3 = time.time()
        result["timings"]["ai"] = t3 - t2
        
        result["analysis"] = analysis
        result["score"] = analysis.get('score', 0)
        result["role"] = analysis.get('extracted_role') # Capture AI extracted role
        result["reasoning"] = analysis.get('reasoning', "N/A")
        result["status"] = "success"
        
    except Exception as e:
        print(f"Error in worker for {filename}: {e}")
        result["error"] = str(e)
        
    result["total_time"] = time.time() - start_time
    return result

@router.post("/screen/")
def screen_resume(
    files: List[UploadFile] = File(...),
    job_description: Optional[str] = Form(None),
    db: Session = Depends(database.get_db)
):
    start_total = time.time()
    print(f"--- START PARALLEL SCREENING: {len(files)} files ---")
    
    # Normalization Helper
    def normalize_role(raw_title: str) -> str:
        # Common prefixes to strip
        prefixes = [
            "we are looking for a", "we are looking for an", "we are looking for",
            "hiring for a", "hiring for an", "hiring for",
            "seeking candidates for a", "seeking candidates for", "seeking", 
            "looking for a", "looking for"
        ]
        
        cleaned = raw_title.lower().strip()
        
        # 1. Strict Canonical Mapping (Based on User Rules)
        if any(k in cleaned for k in ["full stack", "fullstack", "mern", "mean"]):
             return "Full Stack Software Engineer"
        if any(k in cleaned for k in ["frontend", "front end", "react", "angular", "vue"]):
             return "Frontend Developer"
        if any(k in cleaned for k in ["backend", "back end", "node", "django", "fastapi", "java", "spring"]):
             return "Backend Developer"
        if any(k in cleaned for k in ["python", "machine learning", "ai", "data scientist"]):
             return "Python Developer"
        if any(k in cleaned for k in ["software engineer", "developer", "sde"]):
             return "Software Engineer"

        # 2. Fallback: Strip noise if no specific keyword match (preserve original intent but clean it)
        for prefix in prefixes:
            if cleaned.startswith(prefix):
                cleaned = cleaned[len(prefix):].strip()
                break 
        
        # Strip noise suffixes
        noise_phrases = ["to join our development team", "and work on building", "remote", "(remote)", "urgent hiring"]
        for noise in noise_phrases:
            cleaned = cleaned.replace(noise, "")
            
        return cleaned.title().strip()

    # Extract Title from JD (First line)
    jd_lines = [l.strip() for l in job_description.split('\n') if l.strip()]
    if jd_lines:
        raw_title = jd_lines[0][:100] # Take first line
        jd_title = normalize_role(raw_title)
    else:
        jd_title = "General Candidate"
    
    candidate_count = db.query(models.Candidate).count()
    
    MAX_CANDIDATES = 50
    if candidate_count >= MAX_CANDIDATES:
        return {"message": f"Candidate limit ({MAX_CANDIDATES}) reached.", "status": "limit_exceeded"}
    
    if candidate_count + len(files) > MAX_CANDIDATES:
        allowed = MAX_CANDIDATES - candidate_count
        return {"message": f"Upload exceeds limit. Allow {allowed} more.", "status": "limit_exceeded"}

    UPLOAD_DIR = "media/resumes"
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    
    if not job_description or not job_description.strip():
        raise HTTPException(status_code=400, detail="Job Description is required.")

    # 1. Save all files to disk first (Fast IO)
    saved_files = [] 
    results = []
    
    for file in files:
        if not file.filename.lower().endswith(('.pdf', '.docx', '.doc')):
            results.append({"file": file.filename, "error": "Unsupported format.", "status": "failed"})
            continue
            
        file_location = f"{UPLOAD_DIR}/{file.filename}"
        with open(file_location, "wb+") as file_object:
            shutil.copyfileobj(file.file, file_object)
        
        saved_files.append((file_location, file.filename))

    # 2. Parallel Processing (Heavy CPU/Network)
    processed_data = []
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
        future_to_file = {
            executor.submit(process_single_resume, loc, name, job_description, UPLOAD_DIR): name 
            for loc, name in saved_files
        }
        
        for future in concurrent.futures.as_completed(future_to_file):
            data = future.result()
            processed_data.append(data)
            
            # Print logs immediately as they finish
            if data["status"] == "success":
                print(f"Finished {data['file']} in {data['total_time']:.2f}s "
                      f"(Ingest: {data['timings'].get('ingest',0):.2f}s, AI: {data['timings'].get('ai',0):.2f}s)")
            else:
                print(f"Failed {data['file']}: {data['error']}")
    
    # 3. Sequential DB Writes (Main Thread - Safe)
    for data in processed_data:
        if data["status"] == "failed":
            results.append(data)
            continue
            
        # Extract data for DB
        info = data["candidate_info"]
        email = info.get('email')
        score = data["score"]
        
        if not email:
            data["error"] = "Could not extract email."
            data["status"] = "failed"
            results.append(data)
            continue
            
        # DB Upsert
        candidate = db.query(models.Candidate).filter(models.Candidate.email == email).first()
        
        # STRICT ROLE ENFORCEMENT: Always use the Normalized JD Title
        target_role = jd_title
        
        if not candidate:
            print(f"DEBUG: Creating NEW candidate for {email}")
            candidate = models.Candidate(
                name=info.get('name', 'Unknown'),
                email=email,
                role=target_role, # STRICT: Use normalized JD Title
                status=models.CandidateStatus.Applied,
                stage=models.CandidateStage.Resume_Screening,
                resume_file=data["file"],
                full_text=data["full_text"], # Save to SQL
                score=score,
                analysis_data=data["analysis"]
            )
            db.add(candidate)
            db.commit() 
            db.refresh(candidate)
            
            # Log
            log = models.ActivityLog(user_id=None, action="screened", target=candidate.name, details=f"Score: {score}/100")
            db.add(log)
        else:
            print(f"DEBUG: Found EXISTING candidate: {candidate.name}")
            # FIX: Aggressively update metadata if we found better info
            # This fixes "Unknown Candidate" persistence
            new_name = info.get('name', 'Unknown')
            if new_name and new_name not in ["Unknown", "Unknown Candidate", "Candidate", "Resume", "CV"]:
                print(f"DEBUG: Updating Name to: {new_name}")
                candidate.name = new_name
                info["name"] = new_name # Update response data too
            else:
                print(f"DEBUG: Skipping name update. New Name: '{new_name}'")
            
            # STRICT ROLE UPDATE: Enforce the current batch's role
            # This ensures if we re-screen for a NEW role, they get updated.
            if candidate.role != target_role:
                 print(f"DEBUG: Updating Role from '{candidate.role}' to '{target_role}'")
                 candidate.role = target_role
            
            candidate.score = score
            candidate.analysis_data = data["analysis"] # Save full breakdown
            candidate.full_text = data["full_text"] # Update text too
            candidate.status = models.CandidateStatus.Applied # Reset to valid status
            candidate.stage = models.CandidateStage.Resume_Screening
            log = models.ActivityLog(user_id=None, action="re-screened", target=candidate.name, details=f"Score: {score}/100")
            db.add(log)
        db.commit()
        print("DEBUG: DB Commit Successful")
        
        # FINAL FIX: Inject the structure the Frontend expects!
        # Frontend looks for: res.candidate.name
        data["candidate"] = {
            "name": candidate.name,
            "email": candidate.email,
            "id": candidate.id,
            "role": candidate.role
        }
        
        results.append(data)

    total_time = time.time() - start_total
    print(f"--- BATCH COMPLETE in {total_time:.2f}s ---")

    return {
        "message": "Screening Complete",
        "results": results,
        "status": "completed"
    }

@router.post("/candidates/", response_model=schemas.CandidateResponse)
def create_candidate_manual(
    candidate_in: schemas.CandidateCreate,
    db: Session = Depends(database.get_db)
):
    # Check if candidate already exists
    existing = db.query(models.Candidate).filter(models.Candidate.email == candidate_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Candidate with this email already exists.")
    
    new_candidate = models.Candidate(
        name=candidate_in.name,
        email=candidate_in.email,
        role=candidate_in.role,
        stage=candidate_in.stage,
        status=candidate_in.status,
        score=0.0,
        analysis_data={"reasoning": "Manually added candidate."}
    )
    
    db.add(new_candidate)
    db.commit()
    db.refresh(new_candidate)
    
    # Log activity
    log = models.ActivityLog(
        user_id=None,
        action="manually added",
        target=new_candidate.name,
        details=f"Role: {new_candidate.role}"
    )
    db.add(log)
    db.commit()
    
    return new_candidate

@router.get("/candidates/", response_model=List[schemas.CandidateResponse])
def get_candidates(
    stage: Optional[str] = None,
    status: Optional[str] = None,
    role: Optional[str] = None,
    db: Session = Depends(database.get_db)
):
    query = db.query(models.Candidate)
    if stage:
        query = query.filter(models.Candidate.stage == stage)
    if status:
        query = query.filter(models.Candidate.status == status)
    if role:
        query = query.filter(models.Candidate.role == role)
        
    return query.order_by(models.Candidate.created_at.desc()).all()

@router.get("/active-roles/", response_model=List[str])
def get_active_roles(db: Session = Depends(database.get_db)):
    """
    Fetch distinct, non-null job roles from candidates to populate frontend dropdowns.
    """
    roles = db.query(models.Candidate.role).distinct().filter(
        models.Candidate.role != None,
        models.Candidate.role != ""
    ).all()
    # Flatten tuple result [('Role A',), ('Role B',)] -> ['Role A', 'Role B']
    return sorted([r[0] for r in roles if r[0]])
def update_candidate(
    candidate_id: int,
    update_data: schemas.CandidateUpdate,
    db: Session = Depends(database.get_db)
):
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
    
    if update_data.stage:
        candidate.stage = update_data.stage
    if update_data.status:
        candidate.status = update_data.status
        
    db.commit()
    db.refresh(candidate)
    
    # Log the action
    log = models.ActivityLog(
        user_id=None,
        action="promoted",
        target=candidate.name,
        details=f"Moved to {candidate.stage}"
    )
    db.add(log)
    db.commit()
    
    return candidate

@router.delete("/candidates/{candidate_id}/", status_code=status.HTTP_204_NO_CONTENT)
def delete_candidate(
    candidate_id: int,
    db: Session = Depends(database.get_db)
):
    candidate = db.query(models.Candidate).filter(models.Candidate.id == candidate_id).first()
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")
        
    db.delete(candidate)
    db.commit()
    
    return None

@router.post("/candidates/bulk-update/", response_model=Dict[str, Any])
def bulk_update_candidates(
    payload: schemas.BulkCandidateUpdate,
    db: Session = Depends(database.get_db)
):
    candidates = db.query(models.Candidate).filter(models.Candidate.id.in_(payload.candidate_ids)).all()
    
    if not candidates:
        raise HTTPException(status_code=404, detail="No candidates found with provided IDs")
    
    updated_count = 0
    email_sent_count = 0
    
    # STAGE MAPPING
    STAGE_MAPPING = {
        "Resume Screening": models.CandidateStage.Resume_Screening.value,
        "Aptitude Round": models.CandidateStage.Aptitude_Round.value,
        "Coding Round": models.CandidateStage.Coding_Round.value,
        "Technical Interview": models.CandidateStage.Technical_Interview.value,
        "HR Round": models.CandidateStage.HR_Round.value,
        "Offer Sent": models.CandidateStage.Offer_Sent.value
    }
    
    # NEXT STAGE ENFORCEMENT
    VALID_NEXT = {
        models.CandidateStage.Resume_Screening.value: [models.CandidateStage.Aptitude_Round.value],
        models.CandidateStage.Aptitude_Round.value: [models.CandidateStage.Coding_Round.value],
        models.CandidateStage.Coding_Round.value: [models.CandidateStage.Technical_Interview.value],
        models.CandidateStage.Technical_Interview.value: [models.CandidateStage.Offer_Sent.value, models.CandidateStage.HR_Round.value],
        models.CandidateStage.HR_Round.value: [models.CandidateStage.Offer_Sent.value]
    }
    
    target_stage_fixed = STAGE_MAPPING.get(payload.stage, payload.stage) if payload.stage and payload.stage != 'NEXT' else None

    for candidate in candidates:
        has_changed = False
        
        # Determine target stage for this candidate
        current_target = None
        if payload.stage == 'NEXT':
            allowed_next = VALID_NEXT.get(candidate.stage, [])
            if allowed_next:
                current_target = allowed_next[0] # Pick the primary next stage
        else:
            current_target = target_stage_fixed

        # 1. Stage Update (STRICT)
        if current_target and candidate.stage != current_target: 
            # Check if valid next step (if not 'NEXT' mode, validate manually provided stage)
            if payload.stage != 'NEXT':
                # ALLOW ADMIN OVERRIDE: If admin explicitly selects a stage, allow it.
                # We only enforce strict sequence for 'NEXT' (auto-promote).
                pass
            else:
                # For 'NEXT' auto-promote, ensure we have a valid path
                allowed_next = VALID_NEXT.get(candidate.stage, [])
                if not allowed_next:
                     # If no defined next stage, do nothing or error? 
                     # For bulk 'NEXT', we just skip if no path.
                     continue 
                current_target = allowed_next[0]

            old_stage = candidate.stage
            candidate.stage = current_target
            
            # Reset results for any NEW assessment round
            assessment_stages = [
                models.CandidateStage.Aptitude_Round.value, 
                models.CandidateStage.Coding_Round.value,
                models.CandidateStage.Technical_Interview.value
            ]
            if current_target in assessment_stages:
                candidate.score = 0.0
                candidate.status = models.CandidateStatus.Applied
                # Clear round-specific analysis but keep reasoning if possible
                if candidate.analysis_data:
                    new_data = {k: v for k, v in candidate.analysis_data.items() if k in ['reasoning', 'extracted_role', 'sentiment']}
                    candidate.analysis_data = new_data
            
            has_changed = True
            log = models.ActivityLog(user_id=None, action="promoted (bulk)", target=candidate.name, details=f"Moved from {old_stage} to {candidate.stage}")
            db.add(log)

        # 2. Status Update
        if payload.status and candidate.status != payload.status:
            candidate.status = payload.status
            has_changed = True
            
            # Trigger Offer Email if status is "Offer Released"
            if payload.status == "Offer Released":
                candidate.stage = models.CandidateStage.Offer_Sent.value # Update stage so they leave the interview round
                try:
                    import utils
                    from services import email_templates
                    subject = "Congratulations! Your Offer is Ready"
                    html = email_templates.get_offer_email_template(candidate.name, candidate.role or "Software Engineer")
                    if utils.send_email(candidate.email, subject, html):
                        email_sent_count += 1
                except Exception as e:
                    print(f"Failed to send offer email to {candidate.email}: {e}")

        if has_changed:
            updated_count += 1
        
    db.commit()
    
    msg = f"Successfully updated {updated_count} candidate(s)."
    if email_sent_count > 0:
        msg += f" {email_sent_count} offer email(s) sent."
    
    return {
        "message": msg,
        "count": updated_count
    }
        
    db.commit()
    
    return {
        "message": f"Successfully promoted {updated_count} candidate(s) to {payload.stage}.",
        "count": updated_count
    }

@router.get("/stats/", response_model=schemas.StatsResponse)
def get_stats(days: Optional[str] = None, db: Session = Depends(database.get_db)):
    query = db.query(models.Candidate)
    
    if days and days != 'all':
        try:
            d = int(days)
            start_date = datetime.utcnow() - timedelta(days=d)
            query = query.filter(models.Candidate.created_at >= start_date)
        except ValueError:
            pass

    candidates = query.all()
    
    total = len(candidates)
    active = sum(1 for c in candidates if c.status != "Rejected")
    screened = total
    # Count as assessments only if they are not in Applied status (meaning they are assigned/in-progress/completed)
    assessments = sum(1 for c in candidates if c.stage in ["Aptitude Round", "Coding Round", "Technical Interview"] and c.status != "Applied")
    # Count as offers if status is Hired/Offer Released or stage is Offer Sent
    offers = sum(1 for c in candidates if c.status in ["Hired", "Offer Released"] or c.stage == "Offer Sent")
    
    qualified = sum(1 for c in candidates if c.status != "Rejected" and c.stage != "Resume Screening")
    coding_passed = sum(1 for c in candidates if c.stage in ["Technical Interview", "Offer Sent", "HR Round"])
    interview_cleared = offers # Approx logic
    
    return {
        "metrics": {
            "active": active,
            "screened": screened,
            "assessments": assessments,
            "offers": offers
        },
        "funnel": {
            "applications": total,
            "qualified": qualified,
            "coding_passed": coding_passed,
            "interview_cleared": interview_cleared
        }
    }
