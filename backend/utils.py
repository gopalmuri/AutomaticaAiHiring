from passlib.context import CryptContext
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from dotenv import load_dotenv

load_dotenv()

# Security Config
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "your-secret-key-here") # Reuse key or new one
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 1440  # 24 hours for testing

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

# Email Config
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", 587))
EMAIL_USER = os.getenv("EMAIL_HOST_USER")
EMAIL_PASSWORD = os.getenv("EMAIL_HOST_PASSWORD")

def send_email(to_email: str, subject: str, html_content: str):
    # Fetch latest credentials from environment
    load_dotenv(override=True)
    host = os.getenv("EMAIL_HOST", "smtp.gmail.com")
    port = int(os.getenv("EMAIL_PORT", 587))
    user = os.getenv("EMAIL_HOST_USER")
    password = os.getenv("EMAIL_HOST_PASSWORD")

    if not user or not password:
        print("Email credentials not set. Skipping email.")
        return False

    try:
        msg = MIMEMultipart()
        msg['From'] = user
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(html_content, 'html'))
        text = msg.as_string()

        # Strategy 1: TLS on 587 (Standard)
        try:
            print(f"Attempting SMTP via {host}:587 (TLS)...")
            server = smtplib.SMTP(host, 587, timeout=10)
            server.starttls()
            server.login(user, password)
            server.sendmail(user, to_email, text)
            server.quit()
            print(f"Email sent to {to_email} via TLS")
            return True
        except Exception as e_tls:
            print(f"TLS Failed ({e_tls}). Retrying with SSL on 465...")
            
            # Strategy 2: SSL on 465 (Fallback)
            try:
                server = smtplib.SMTP_SSL(host, 465, timeout=10)
                server.login(user, password)
                server.sendmail(user, to_email, text)
                server.quit()
                print(f"Email sent to {to_email} via SSL")
                return True
            except Exception as e_ssl:
                print(f"SSL Failed ({e_ssl}). Email sending aborted.")
                raise e_ssl

    except Exception as e:
        print(f"FINAL EMAIL FAILURE: {e}")
        return False
