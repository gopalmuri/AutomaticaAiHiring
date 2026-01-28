from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
import schemas, models, utils, database

router = APIRouter(
    prefix="/api/auth",
    tags=["auth"]
)

# Login


# We need a custom schema for login if it doesn't match UserCreate exactly or use Body.
# Frontend: JSON.stringify({ username: email, password: password })
# Let's create a LoginSchema
from pydantic import BaseModel
class LoginSchema(BaseModel):
    username: str
    password: str

@router.post("/login/", response_model=schemas.Token)
def login(login_data: LoginSchema, db: Session = Depends(database.get_db)):
    print(f"--- DEBUG LOGIN ATTEMPT ---")
    print(f"Received Username (Email): '{login_data.username}'")
    print(f"Received Password: '{login_data.password}'")
    
    user = db.query(models.User).filter(models.User.email == login_data.username).first()
    if not user:
        print(f"RESULT: User not found in DB.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    print(f"Found User: {user.email}")
    is_valid = utils.verify_password(login_data.password, user.hashed_password)
    print(f"Hash Match: {is_valid}")
    
    if not is_valid:
        print(f"RESULT: Password mismatch.")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    print(f"RESULT: Success.")
    access_token = utils.create_access_token(data={"sub": user.email})
    return {"access": access_token, "token_type": "bearer"}

@router.post("/candidate-login/", response_model=schemas.Token)
def candidate_login(login_data: LoginSchema, db: Session = Depends(database.get_db)):
    print(f"--- CANDIDATE LOGIN ATTEMPT ---")
    candidate = db.query(models.Candidate).filter(models.Candidate.email == login_data.username).first()
    
    if not candidate:
        print("Candidate not found")
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    if not candidate.hashed_password:
        print("Candidate has no password set (maybe not assigned yet)")
        raise HTTPException(status_code=401, detail="Access not authorized")
        
    if not utils.verify_password(login_data.password, candidate.hashed_password):
        print("Password mismatch")
        raise HTTPException(status_code=401, detail="Invalid credentials")
        
    # Map to Shadow User (created during assignment)
    shadow_email = f"candidate_{candidate.id}@hiringai.internal"
    print(f"Mapping to Shadow User: {shadow_email}")
    
    # Verify shadow user exists (sanity check)
    shadow_user = db.query(models.User).filter(models.User.email == shadow_email).first()
    if not shadow_user:
         # Should not happen if assigned correctly, but auto-heal?
         # No, create it here if missing? better error.
         print("Shadow user missing!")
         raise HTTPException(status_code=401, detail="System configuration error. Please contact HR.")

    # 4. CHECK SUBMISSION STATUS (Prevent Re-Login)
    # Check if this user has any assessment marked as 'completed'
    latest_assessment = db.query(models.Assessment)\
        .filter(models.Assessment.user_id == shadow_user.id)\
        .order_by(models.Assessment.created_at.desc())\
        .first()
        
    if latest_assessment and latest_assessment.status == models.AssessmentStatus.completed:
        print(f"Login Blocked: Assessment {latest_assessment.id} is already completed.")
        raise HTTPException(
            status_code=403, 
            detail="You have already submitted this assessment. Access is revoked."
        )

    access_token = utils.create_access_token(data={"sub": shadow_email})
    return {"access": access_token, "token_type": "bearer"}

# Dependency
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login/")

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(database.get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # LOGGING TO FILE
        with open("auth_debug.log", "a") as f:
            f.write(f"\n--- AUTH REQUEST ---\n")
            f.write(f"Token: {token[:20]}...\n")
            
        payload = jwt.decode(token, utils.SECRET_KEY, algorithms=[utils.ALGORITHM])
        email: str = payload.get("sub")
        
        with open("auth_debug.log", "a") as f:
            f.write(f"Decoded Email: {email}\n")
            
        if email is None:
            raise credentials_exception
        token_data = schemas.TokenData(email=email)
    except JWTError as e:
        with open("auth_debug.log", "a") as f:
            f.write(f"JWT Error: {e}\n")
        # Expose error for debugging
        raise HTTPException(
            status_code=401, 
            detail=f"JWT Error: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"}
        )
        
    user = db.query(models.User).filter(models.User.email == token_data.email).first()
    if user is None:
        with open("auth_debug.log", "a") as f:
            f.write(f"User Not Found in DB: {token_data.email}\n")
        raise HTTPException(
            status_code=401, 
            detail=f"User Not Found: {token_data.email}",
            headers={"WWW-Authenticate": "Bearer"}
        )
        
    with open("auth_debug.log", "a") as f:
        f.write(f"Auth Success: {user.email}\n")
    return user
