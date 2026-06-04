"""
SolarOps — Client Report Email API (Python / smtplib)

POST /api/send-report
Body JSON: { to, subject, html, smtpHost, smtpPort, smtpUser, smtpPass, fromName }

Sends the HTML report email via the caller's IONOS (or any) SMTP relay.
Credentials are passed per-request from the browser session — nothing stored server-side.
"""

from http.server import BaseHTTPRequestHandler
import json
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length)) if length else {}

            to = body.get("to", "").strip()
            subject = body.get("subject", "Solar Production Report")
            html = body.get("html", "")
            smtp_host = body.get("smtpHost", "smtp.ionos.com")
            smtp_port = int(body.get("smtpPort", 465))
            smtp_user = body.get("smtpUser", "").strip()
            smtp_pass = body.get("smtpPass", "")
            from_name = body.get("fromName", "Conexsol Energy")
            bcc = body.get("bcc", "")

            if not to or not smtp_user or not smtp_pass:
                self._json(400, {"error": "Missing required fields: to, smtpUser, smtpPass"})
                return

            if not html:
                self._json(400, {"error": "Missing html body"})
                return

            msg = MIMEMultipart("alternative")
            msg["From"] = f"{from_name} <{smtp_user}>"
            msg["To"] = to
            msg["Subject"] = subject
            if bcc:
                msg["Bcc"] = bcc

            msg.attach(MIMEText(
                "Please view this email in an HTML-capable client.", "plain", "utf-8"
            ))
            msg.attach(MIMEText(html, "html", "utf-8"))

            recipients = [to]
            if bcc:
                recipients.append(bcc)

            ctx = ssl.create_default_context()

            if smtp_port == 465:
                with smtplib.SMTP_SSL(smtp_host, smtp_port, context=ctx, timeout=15) as srv:
                    srv.login(smtp_user, smtp_pass)
                    srv.sendmail(smtp_user, recipients, msg.as_string())
            else:
                with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as srv:
                    srv.ehlo()
                    srv.starttls(context=ctx)
                    srv.ehlo()
                    srv.login(smtp_user, smtp_pass)
                    srv.sendmail(smtp_user, recipients, msg.as_string())

            self._json(200, {"ok": True, "to": to})

        except smtplib.SMTPAuthenticationError:
            self._json(401, {"error": "SMTP authentication failed. Check your email and password."})
        except smtplib.SMTPException as e:
            self._json(502, {"error": f"SMTP error: {str(e)}"})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def _json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
