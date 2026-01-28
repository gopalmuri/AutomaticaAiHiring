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

# CORS
# CORS Configuration
frontend_url = os.getenv("FRONTEND_URL", "https://automatica-ai-hiring.vercel.app")
origins = [
    "http://localhost:5173",
    "http://localhost:5174",
    frontend_url,
    "https://automatica-ai-hiring.vercel.app" # Hardcoded fallback just in case
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
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
