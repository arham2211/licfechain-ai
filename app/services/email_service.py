"""Email service for sending credentials to the admin notification email."""
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import asyncio
from functools import partial

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def _send_email_sync(
    name: str,
    email: str,
    username: str,
    password: str,
    role: str,
) -> bool:
    settings = get_settings()

    if not settings.SMTP_HOST or not settings.SMTP_USER:
        logger.warning(
            "SMTP not configured — credentials NOT emailed. "
            f"name={name}, email={email}, username={username}, password={password}, role={role}"
        )
        return False

    role_label = role.title()
    subject = f"LifeChain AI – New {role_label} Account Created"

    html_body = f"""
    <html><body style="font-family:Arial,sans-serif;background:#f4f7fb;margin:0;padding:0;">
      <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:16px;
                  box-shadow:0 4px 24px rgba(2,132,199,0.10);overflow:hidden;">
        <div style="background:linear-gradient(90deg,#0284c7,#06b6d4);padding:24px 28px;">
          <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700;">LifeChain AI</h1>
          <p style="margin:4px 0 0;color:#bae6fd;font-size:13px;">New {role_label} Account Credentials</p>
        </div>
        <div style="padding:28px;">
          <p style="color:#334155;font-size:14px;margin:0 0 20px;">
            A new <strong>{role_label}</strong> account has been created. Here are the login details:
          </p>
          <table style="width:100%;border-collapse:collapse;font-size:15px;">
            <tr>
              <td style="padding:12px 0 12px 0;color:#64748b;font-weight:600;width:110px;border-bottom:1px solid #f1f5f9;">{role_label} Name</td>
              <td style="padding:12px 0;color:#0f172a;font-weight:700;border-bottom:1px solid #f1f5f9;">{name}</td>
            </tr>
            <tr>
              <td style="padding:12px 0;color:#64748b;font-weight:600;border-bottom:1px solid #f1f5f9;">Email</td>
              <td style="padding:12px 0;color:#0284c7;border-bottom:1px solid #f1f5f9;">{email}</td>
            </tr>
            <tr>
              <td style="padding:12px 0;color:#64748b;font-weight:600;">Password</td>
              <td style="padding:12px 0;color:#0f172a;font-family:monospace;font-size:17px;font-weight:700;letter-spacing:1px;">{password}</td>
            </tr>
          </table>
          <p style="color:#94a3b8;font-size:12px;margin:20px 0 0;">
            Please share these credentials with the new user and advise them to change their password after first login.
          </p>
        </div>
      </div>
    </body></html>
    """

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = settings.SMTP_USER
    msg["To"] = settings.NOTIFICATION_EMAIL
    msg.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.SMTP_USER, [settings.NOTIFICATION_EMAIL], msg.as_string())
        logger.info(f"Credentials email sent to {settings.NOTIFICATION_EMAIL} for {name} ({role})")
        return True
    except Exception as exc:
        logger.error(f"Failed to send credentials email: {exc}")
        return False


async def send_credentials_email(
    name: str,
    email: str,
    username: str,
    password: str,
    role: str,
) -> bool:
    """Async wrapper — runs the blocking SMTP call in a thread-pool executor."""
    loop = asyncio.get_event_loop()
    fn = partial(_send_email_sync, name, email, username, password, role)
    return await loop.run_in_executor(None, fn)
