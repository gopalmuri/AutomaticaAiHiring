# Deployment Guide

This guide details the deployment process for the HiringAI application, covering both the FastAPI backend and the Vite/React frontend.

## Backend Deployment

### Prerequisites
*   Python 3.11+
*   Pip (Python package installer)
*   **Databases**: 
    *   PostgreSQL (for relational data)

*   **API Keys**:
    *   Groq API Key (for AI generation)
    *   Vapi API Key (for voice interviews)

### Local Development

1.  **Navigate to the backend directory:**
    ```bash
    cd backend
    ```

2.  **Create and activate a virtual environment:**
    ```bash
    # Windows
    python -m venv venv
    venv\Scripts\activate

    # macOS/Linux
    python3 -m venv venv
    source venv/bin/activate
    ```

3.  **Install dependencies:**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Configure Environment Variables:**
    Create a `.env` file in the `backend/` directory with the following keys:
    ```env
    # Database
    DATABASE_URL=postgresql://user:password@host:port/dbname


    # API Keys
    GROQ_API_KEY=your_groq_api_key
    VAPI_API_KEY=your_vapi_api_key
    
    # Security (if applicable)
    SECRET_KEY=your_secret_key
    ```

5.  **Run the development server:**
    ```bash
    uvicorn main:app --reload --port 8000
    ```
    The API will be available at `http://localhost:8000`.

### Production Deployment (Render, Railway, etc.)

The backend is configured to run with `uvicorn`.

1.  **Connect your repository** to your hosting provider (e.g., Render, Railway).
2.  **Root Directory**: Set the root directory to `backend` (if deploying monorepo) or ensure `requirements.txt` is in the root of the build context.
3.  **Build Command**:
    ```bash
    pip install -r requirements.txt
    ```
4.  **Start Command** (defined in `Procfile`):
    ```bash
    uvicorn main:app --host 0.0.0.0 --port $PORT
    ```
5.  **Environment Variables**:
    Set the following production environment variables in your dashboard:
    *   `DATABASE_URL`
    *   `GROQ_API_KEY`
    *   `VAPI_API_KEY`

    *   `PYTHON_VERSION` (recommended: 3.11.0)

---

## Frontend Deployment

### Prerequisites
*   Node.js 18+
*   npm

### Local Development

1.  **Navigate to the frontend directory:**
    ```bash
    cd frontend
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**
    Create a `.env` file (or `.env.local`) in the `frontend/` directory:
    ```env
    VITE_API_URL=http://localhost:8000
    VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
    ```
    *Note: `VITE_API_URL` should point to your local or remote backend.*

4.  **Run the development server:**
    ```bash
    npm run dev
    ```
    The app will be available at `http://localhost:5173` (default).

### Production Deployment (Vercel, Netlify, etc.)

The frontend uses Vite for building the production assets.

1.  **Connect your repository** to Vercel/Netlify.
2.  **Root Directory**: `frontend`
3.  **Build Command**:
    ```bash
    npm run build
    ```
4.  **Output Directory**: `dist`
5.  **Environment Variables**:
    Add these variables in your deployment dashboard:
    *   `VITE_API_URL`: Your deployed backend URL (e.g., `https://hiringai-backend.onrender.com`)
    *   `VITE_CLERK_PUBLISHABLE_KEY`: Your Clerk production key

### Automatic Deployment
Both Vercel and Render/Railway support automatic deployments on `git push`. Ensure your branches are correctly configured (e.g., `main` branch usually triggers production deployment).

---

## Technical Reference & Data Architecture

This section details the internal data models, architecture, and data flow of the HiringAI application.

### 1. Technology Stack Overview

*   **Frontend**: React (Vite), TailwindCSS, Clerk (Auth), Vapi SDK (Voice), Axios.
*   **Backend**: FastAPI (Python), SQLAlchemy (ORM), Pydantic (Validation).
*   **Database**: PostgreSQL (Primary Relational DB).
*   **AI Services**: 
    *   **Groq (Llama 3.1)**: Used for Resume Screening, Question Generation, and Transcript Analysis.
    *   **Vapi.ai**: Used for Real-time Voice AI Interviews.

### 2. Data Models (PostgreSQL Schema)

The application uses SQLAlchemy ORM with the following core models:

#### **User Management (`User`)**
Stores internal users and potential candidates who assume account creation.
*   `role`: Enum (`SUPER_ADMIN`, `HR_ADMIN`, `INTERVIEWER`, `CANDIDATE`)
*   `email`: Unique identifier.
*   `is_active`: Boolean status.

#### **Recruitment Layout (`Candidate`)**
Represents an applicant for a specific role.
*   **Fields**: `name`, `email`, `role` (Job Title), `resume_file` (Path), `full_text` (Parsed Resume Content).
*   **Status Tracking**: 
    *   `stage`: `Resume Screening` -> `Aptitude Round` -> `Coding Round` -> `Technical Interview` -> `HR Round` -> `Offer Sent`.
    *   `status`: `Applied`, `In Progress`, `Hired`, `Rejected`.
*   **AI Data**:
    *   `score`: Aggregate fit score (0-100).
    *   `analysis_data`: JSON field containing detailed breakdown (Skills match, Experience score, Missing skills).

#### **Assessments & Testing (`Assessment`)**
Tracks specific test instances assigned to users/candidates.
*   **Types**: `aptitude`, `coding`, `interview`.
*   **Status**: `pending`, `in_progress`, `completed`, `failed`.
*   **Config**: JSON field storing specific questions, time limits, or constraints.
*   **Score**: Numeric result of the specific assessment.

#### **Job Descriptions (`JobDescription`)**
*   Stores the reference text (`description`) and `title` used for AI Resume Screening comparisons.

### 3. Data Flow & AI Integration

#### **A. Resume Screening Pipeline**
1.  **Upload**: User uploads PDF via Frontend.
2.  **Extraction (Backend)**: 
    *   `pypdf` extracts raw text.
    *   Regex/Heuristic logic attempts to extract Name/Email.
    *   If heuristics fail, **Groq LLM** parses contact info from the header text.
3.  **Analysis**:
    *   The system retrieves the relevant **Job Description**.
    *   **RAG Service** sends `Job Description` + `Resume Text` to **Groq**.
    *   **Groq** returns a detailed JSON evaluation (Key Skills, Missing Skills, Component Scores).
4.  **Storage**: The JSON result is stored in `Candidate.analysis_data` and the `score` is updated.

#### **B. Voice AI Interview Flow**
1.  **Initialization**: Frontend requests a Vapi session.
2.  **Configuration (Backend)**: `VapiService` calls **Vapi.ai API** (`POST /assistant`) with:
    *   Candidate Name/Role.
    *   System Prompt: "You are a Senior Technical Interviewer..."
    *   Context: Candidate's Resume Summary.
3.  **Interaction**: User speaks effectively only to Vapi.ai (Client-side/Server-side relay).
4.  **Completion**: 
    *   Vapi webhook/callback provides the **conversation transcript**.
    *   Backend sends transcript to **Groq** for scoring.
    *   **Groq** evaluates: Technical Accuracy, Communication Clarity, Depth of Knowledge.
    *   Final scores are saved to the `Assessment` record.

#### **C. Coding Assessments**
1.  **Generation**: Questions are dynamically generated by **Groq** based on difficulty/topic.
2.  **Execution**: Candidate code is sent to backend.
3.  **Evaluation**: 
    *   **Security**: Code is evaluated/run (Sandboxed env recommended for prod).
    *   **Tests**: Output is compared against hidden test cases generated by the system.
