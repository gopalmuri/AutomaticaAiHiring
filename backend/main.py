from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import models, database
from routers import auth, assessments, resume, dashboard, settings, interview
import os
# Suppress TensorFlow Warnings
os.environ['TF_ENABLE_ONEDNN_OPTS'] = '0'
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="HiringAI Enterprise API")

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    print(f"ERROR: 422 Validation Error at {request.url.path}")
    print(f"Detail: {exc.errors()}")
    print(f"Body: {await request.body()}")
    return JSONResponse(
        status_code=422,
        content={"detail": exc.errors(), "body": str(await request.body())},
    )

# Database Init
models.Base.metadata.create_all(bind=database.engine)

# Manual Migration for Schema Updates (Fixes 500 Error if columns missing)
from sqlalchemy import text
def run_manual_migrations():
    try:
        with database.engine.connect() as connection:
            print("Running Schema Check/Update...")
            connection.execute(text("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS role VARCHAR(100);"))
            connection.execute(text("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS hashed_password VARCHAR(255);"))
            connection.execute(text("ALTER TABLE assessments ADD COLUMN IF NOT EXISTS started_at TIMESTAMP WITH TIME ZONE;"))
            connection.commit()
            print("Schema Check Completed.")
    except Exception as e:
        print(f"Schema Update Warning (Safe to ignore if columns exist): {e}")

run_manual_migrations()

# CORS
# Custom CORS Middleware to force headers
@app.middleware("http")
async def add_cors_headers(request: Request, call_next):
    origin = request.headers.get("origin")
    
    # Define allowed patterns
    allowed = False
    if origin:
        if "localhost" in origin:
            allowed = True
        elif ".vercel.app" in origin and origin.startswith("https://"):
            allowed = True
    
    # Handle Preflight OPTIONS request
    if request.method == "OPTIONS":
        response = JSONResponse(content="ok")
        if allowed:
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Methods"] = "*"
            response.headers["Access-Control-Allow-Headers"] = "*"
            response.headers["Access-Control-Allow-Credentials"] = "true"
        return response

    # Process actual request
    response = await call_next(request)
    
    # Add Headers to Response
    if allowed:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        
    return response

# Standard CORS backup (can keep or remove, keeping for safety but effectively overruled by above)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # We let manual middleware handle the restriction
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(auth.router)
app.include_router(assessments.router)
app.include_router(resume.router)
app.include_router(dashboard.router)
app.include_router(settings.router)
app.include_router(interview.router)

@app.get("/")
def read_root():
    return {"message": "HiringAI Backend is running on FastAPI!"}
