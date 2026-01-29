from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, JSON, Float, DateTime, Text, Enum as SqlEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import enum
from database import Base

class UserRole(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    HR_ADMIN = "HR_ADMIN"
    INTERVIEWER = "INTERVIEWER"
    CANDIDATE = "CANDIDATE"

class AssessmentType(str, enum.Enum):
    aptitude = "aptitude"
    coding = "coding"
    interview = "interview"

class AssessmentStatus(str, enum.Enum):
    pending = "pending"
    in_progress = "in_progress"
    completed = "completed"
    failed = "failed"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(150), unique=True, index=True)
    hashed_password = Column(String(255))
    role = Column(String(50), default=UserRole.CANDIDATE) # Stores enum value as string
    is_active = Column(Boolean, default=True)
    password_changed = Column(Boolean, default=False)
    company_id = Column(Integer, nullable=True) # Placeholder if needed

    assessments = relationship("Assessment", back_populates="user")

class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(Integer, primary_key=True, index=True)
    candidate_email = Column(String(150), index=True)
    type = Column(String(50)) # Stores AssessmentType as string
    config = Column(JSON, default={})
    status = Column(String(50), default=AssessmentStatus.pending)
    score = Column(Float, default=0.0)
    
    user_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    user = relationship("User", back_populates="assessments")

# Resume Screening Models
class CandidateStatus(str, enum.Enum):
    Applied = "Applied"
    In_Progress = "In Progress"
    Hired = "Hired"
    Rejected = "Rejected"

class CandidateStage(str, enum.Enum):
    Resume_Screening = "Resume Screening"
    Aptitude_Round = "Aptitude Round"
    Coding_Round = "Coding Round"
    Technical_Interview = "Technical Interview"
    HR_Round = "HR Round"
    Offer_Sent = "Offer Sent"

class JobDescription(Base):
    __tablename__ = "job_descriptions"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200))
    description = Column(Text)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())
    target_capacity = Column(Integer, default=50)

class Candidate(Base):
    __tablename__ = "candidates"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), default="Unknown Candidate")
    email = Column(String(150), unique=True, index=True)
    role = Column(String(100))
    status = Column(String(50), default=CandidateStatus.Applied)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=True) # Linked to the Admin/HR who added them
    stage = Column(String(50), default=CandidateStage.Resume_Screening)
    resume_file = Column(String(255), nullable=True) # File path
    full_text = Column(Text, nullable=True) # Full resume text for screening
    score = Column(Float, default=0.0)
    analysis_data = Column(JSON, nullable=True) # AI Breakdown
    hashed_password = Column(String(255), nullable=True) # Added for separate auth
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

class ActivityLog(Base):
    __tablename__ = "activity_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action = Column(String(100))
    target = Column(String(255))
    details = Column(Text, nullable=True)
    is_read = Column(Boolean, default=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

class GlobalSettings(Base):
    __tablename__ = "global_settings"
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(50), unique=True, index=True, default="default") 
    config = Column(JSON, default={})
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

class Notification(Base):
    __tablename__ = "notifications"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String(200))
    message = Column(Text)
    is_read = Column(Boolean, default=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
