#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EduVault - OLM Automatic Sync Pipeline
Fetches assigned tests/lessons from OLM (olm.vn), downloads the Word .docx format,
parses them into the EduVault JSON format, and merges them into data/exams.json.
"""

import os
import sys

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import re
import json
import io
import argparse
import unicodedata
from typing import Dict, List, Optional, Any, Tuple
import requests
import docx
from docx.enum.text import WD_UNDERLINE


# Standard subject name normalization mapping for EduVault
SUBJECT_NORMALIZATION = {
    "TOAN": "Toán",
    "TOÁN": "Toán",
    "VAT LY": "Vật Lý",
    "VẬT LÝ": "Vật Lý",
    "VAT LI": "Vật Lý",
    "VẬT LÍ": "Vật Lý",
    "HOA HOC": "Hóa Học",
    "HÓA HỌC": "Hóa Học",
    "HOA": "Hóa Học",
    "HÓA": "Hóa Học",
    "SINH HOC": "Sinh Học",
    "SINH HỌC": "Sinh Học",
    "SINH": "Sinh Học",
    "TIN HOC": "Tin Học",
    "TIN HỌC": "Tin Học",
    "TIN": "Tin Học",
    "TIENG ANH": "Tiếng Anh",
    "TIẾNG ANH": "Tiếng Anh",
    "ENGLISH": "Tiếng Anh",
    "NONE": "Tiếng Anh",
    "NGU VAN": "Ngữ Văn",
    "NGỮ VĂN": "Ngữ Văn",
    "VAN": "Ngữ Văn",
    "VĂN": "Ngữ Văn",
    "LICH SU": "Lịch Sử",
    "LỊCH SỬ": "Lịch Sử",
    "SU": "Lịch Sử",
    "SỬ": "Lịch Sử",
    "DIA LY": "Địa Lí",
    "ĐỊA LÝ": "Địa Lí",
    "DIA LI": "Địa Lí",
    "ĐỊA LÍ": "Địa Lí",
    "GDCD": "GDCD",
    "GIAO DUC CONG DAN": "GDCD",
    "GIÁO DỤC CÔNG DÂN": "GDCD",
    "GIAO DUC KINH TE VA PHAP LUAT": "GDKT & PL",
    "GIÁO DỤC KINH TẾ VÀ PHÁP LUẬT": "GDKT & PL",
    "CONG NGHE": "Công Nghệ",
    "CÔNG NGHỆ": "Công Nghệ",
    "KHOA HOC TU NHIEN": "KHTN",
    "KHOA HỌC TỰ NHIÊN": "KHTN"
}


def slugify(text: str) -> str:
    """Generate ASCII URL/ID slug from Vietnamese text."""
    if not text:
        return "olm-exam"
    text = unicodedata.normalize("NFD", str(text))
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = text.replace("đ", "d").replace("Đ", "D").lower()
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:75] if text else "olm-exam"


def normalize_subject(name: Optional[str]) -> str:
    """Normalize subject string to standard EduVault subject naming."""
    if not name:
        return "Chung"
    clean = re.sub(r"\s+", " ", name).strip()
    upper = slugify(clean).upper().replace("-", " ")
    for k, v in SUBJECT_NORMALIZATION.items():
        if k == upper or upper.startswith(k + " ") or upper.endswith(" " + k):
            return v
    # Direct check against values
    for v in SUBJECT_NORMALIZATION.values():
        if v.lower() == clean.lower():
            return v
    return clean.title()


def parse_cookie_string(raw: str) -> Dict[str, str]:
    """Parse cookie string or JSON string into cookie dictionary."""
    cookies = {}
    raw = raw.strip()
    if not raw:
        return cookies

    # Check if raw string is JSON format
    if raw.startswith("{") and raw.endswith("}"):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return {str(k): str(v) for k, v in parsed.items()}
        except Exception:
            pass

    # Handle standard cookie header format: name1=val1; name2=val2
    if "=" in raw:
        for part in raw.split(";"):
            part = part.strip()
            if "=" in part:
                k, v = part.split("=", 1)
                cookies[k.strip()] = v.strip()
    else:
        # If single token without '=' passed, assume olm_session & PHPSESSID
        cookies["olm_session"] = raw
        cookies["PHPSESSID"] = raw

    return cookies


def get_authenticated_session() -> requests.Session:
    """Initialize a requests Session with OLM authentication cookies and browser headers."""
    session = requests.Session()
    cookie_val = (os.environ.get("OLM_COOKIES") or os.environ.get("OLM_SESSION") or "").strip()
    # Strip any enclosing quotes
    if (cookie_val.startswith("'") and cookie_val.endswith("'")) or (cookie_val.startswith('"') and cookie_val.endswith('"')):
        cookie_val = cookie_val[1:-1].strip()

    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://olm.vn/lop-hoc-cua-toi",
        "X-Requested-With": "XMLHttpRequest",
    })
    if cookie_val:
        session.headers["Cookie"] = cookie_val
        cookies = parse_cookie_string(cookie_val)
        for k, v in cookies.items():
            session.cookies.set(k, v, domain=".olm.vn")
            session.cookies.set(k, v, domain="olm.vn")

    return session


def fetch_assigned_lessons_from_olm(session: requests.Session) -> List[Dict[str, Any]]:
    """
    Fetch assigned lessons/exams from OLM via student courseware API.
    """
    api_url = "https://olm.vn/classes/courseware/list-courseware-of-student"
    print(f"[*] Querying OLM Student Courseware API: {api_url}...")
    lessons = []
    seen_ids = set()

    api_headers = {
        "Accept": "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        "Referer": "https://olm.vn/lop-hoc-cua-toi"
    }

    try:
        resp = session.get(api_url, headers=api_headers, timeout=25)
        print(f"[*] OLM API Response status: {resp.status_code}")
        if resp.status_code != 200:
            print(f"[!] OLM API returned non-200: {resp.text[:250]}")
        if resp.status_code == 200:
            data = resp.json()
            raw_list = data.get("list", [])
            for item in raw_list:
                id_skill = str(item.get("id_skill") or item.get("id_cate") or item.get("_id") or "").strip()
                if not id_skill or id_skill in seen_ids:
                    continue
                seen_ids.add(id_skill)
                title = item.get("title") or f"Bài tập #{id_skill}"
                options = item.get("options") or {}
                timedo = options.get("timedo")
                try:
                    duration = int(timedo) if timedo and int(timedo) > 0 else 45
                except (ValueError, TypeError):
                    duration = 45

                lessons.append({
                    "lessonId": id_skill,
                    "title": title.strip(),
                    "subject": "",
                    "teacher": None,
                    "duration": duration,
                    "deadline": item.get("expired")
                })
            print(f"[+] Found {len(lessons)} assigned exam(s) from OLM Student API.")
            if lessons:
                return lessons
    except Exception as e:
        st_code = getattr(resp, "status_code", None)
        print(f"[!] OLM API notice: status={st_code}, error={e}")

    return lessons



def download_word_docx(session: requests.Session, lesson_id: str) -> Optional[bytes]:
    """
    Download Word .docx file via /download-word-for-user endpoint.
    Handles both direct binary stream and JSON redirection response.
    """
    endpoint = f"https://olm.vn/download-word-for-user?id_cate={lesson_id}&showAns=1&questionNotApproved=0"
    try:
        resp = session.get(endpoint, timeout=35, allow_redirects=True)
    except Exception as e:
        print(f"[!] Error requesting export for ID {lesson_id}: {e}")
        return None

    if resp.status_code != 200:
        print(f"[!] Export request for ID {lesson_id} returned HTTP {resp.status_code}")
        return None

    content = resp.content

    # Check if direct DOCX/ZIP binary (Magic Number: PK\x03\x04)
    if content.startswith(b"PK\x03\x04"):
        return content

    # Check if response is JSON containing file URL: {"file": "https://..."}
    try:
        data = resp.json()
        if isinstance(data, dict) and data.get("file"):
            file_url = data["file"].strip()
            # Security check: must be from olm.vn
            if "olm.vn" in file_url:
                f_resp = session.get(file_url, timeout=35, allow_redirects=True)
                if f_resp.status_code == 200 and f_resp.content.startswith(b"PK\x03\x04"):
                    return f_resp.content
    except Exception:
        pass

    return None


def parse_docx_to_eduvault_exam(
    docx_bytes_or_path: Any,
    lesson_id: Optional[str] = None,
    metadata_override: Optional[Dict[str, Any]] = None
) -> Optional[Dict[str, Any]]:
    """
    Parse an OLM Word .docx document into EduVault JSON exam format.
    Extracts title, subject, grade, questions, options, correct answers, explanations, and passages.
    """
    try:
        if isinstance(docx_bytes_or_path, (bytes, bytearray)):
            doc = docx.Document(io.BytesIO(docx_bytes_or_path))
        else:
            doc = docx.Document(docx_bytes_or_path)
    except Exception as e:
        print(f"[!] Failed to open docx: {e}")
        return None

    # Step 1: Extract Document Header Metadata
    title = ""
    subject = ""
    grade = "Lớp 12"

    for p in doc.paragraphs[:8]:
        text = p.text.strip()
        if not text:
            continue
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        for line in lines:
            if re.search(r"^[Bb]ài\s+học:\s*", line, re.IGNORECASE):
                title = re.sub(r"^[Bb]ài\s+học:\s*", "", line, flags=re.IGNORECASE).strip()
            m_sub = re.search(r"MÔN\s+([^\n\r]+?)\s+LỚP\s+(\d+)", line, re.IGNORECASE)
            if m_sub:
                raw_sub = m_sub.group(1).strip()
                subject = normalize_subject(raw_sub)
                grade = f"Lớp {m_sub.group(2)}"
            elif "MÔN" in line and not subject:
                m_sub2 = re.search(r"MÔN\s+([A-ZÀ-Ỹa-zà-ỹ\s]+)", line)
                if m_sub2:
                    subject = normalize_subject(m_sub2.group(1).strip())

    # Step 2: Parse Questions, Options, Answers, Explanations, and Passages
    questions = []
    current_q = None
    mode = None  # 'QUESTION' | 'OPTIONS' | 'EXPLANATION'
    current_passage = ""

    for p in doc.paragraphs:
        raw_text = p.text.strip()
        if not raw_text:
            continue

        # Check if a new question starts: 'Câu 1.', 'Câu 2:', 'Câu 3 '
        m_q = re.match(r"^Câu\s+(\d+)[\.:\s]+(.*)", raw_text, re.DOTALL | re.IGNORECASE)
        if m_q:
            if current_q:
                # Finalize previous question
                questions.append(current_q)

            q_num = int(m_q.group(1))
            q_text = m_q.group(2).strip()

            # Attach passage if available
            if current_passage:
                q_text = f"<div class=\"passage mb-4 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 text-sm leading-relaxed\">{current_passage}</div>{q_text}".strip()
                # Do not clear current_passage yet if it covers multiple questions (e.g. from X to Y)
                if not re.search(r"(?:blank|blanks|từ\s+câu|đến\s+câu)\s+\d+", current_passage, re.IGNORECASE):
                    current_passage = ""

            current_q = {
                "id": q_num,
                "question": q_text if q_text else f"Chọn phương án đúng cho câu {q_num}:",
                "options": [],
                "correct": 0,
                "explanation": ""
            }
            mode = "QUESTION"
            continue

        if not current_q:
            # Check if this header paragraph is actually an intro passage for upcoming questions
            if (
                "Read the following" in raw_text
                or "Đọc đoạn văn" in raw_text
                or "Đọc thông tin" in raw_text
                or len(raw_text) > 120
            ) and not raw_text.startswith("BÀI LUYỆN TẬP") and not raw_text.startswith("Họ, tên:"):
                current_passage = raw_text
            continue

        # Check if Explanation starts
        if re.match(r"^(Hướng dẫn giải|Lời giải|Giải thích)[:\s]*", raw_text, re.IGNORECASE):
            mode = "EXPLANATION"
            exp_text = re.sub(r"^(Hướng dẫn giải|Lời giải|Giải thích)[:\s]*", "", raw_text, flags=re.IGNORECASE).strip()
            if exp_text:
                current_q["explanation"] = exp_text
            continue

        if mode == "EXPLANATION":
            if current_q["explanation"]:
                current_q["explanation"] += "\n" + raw_text
            else:
                current_q["explanation"] = raw_text
            continue

        # Check if this paragraph contains options: A. ... B. ... or a) ... b) ...
        has_options = bool(re.search(r"(?:^|\s+)([A-D]\.|\b[a-d]\))\s+", raw_text))
        if has_options:
            mode = "OPTIONS"
            underlined_letters = []

            # Inspect runs to identify which option is marked with underline
            for r in p.runs:
                is_u = bool(r.underline)
                if not is_u:
                    # Deep OpenXML w:u check
                    u_nodes = r._r.xpath("./w:rPr/w:u")
                    if u_nodes and u_nodes[0].get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val") != "none":
                        is_u = True

                if is_u:
                    m_u = re.search(r"([A-D])\.|([a-d])\)", r.text)
                    if m_u:
                        let = m_u.group(1) or m_u.group(2)
                        underlined_letters.append(let.upper())

            # Split paragraph into individual options
            parts = re.split(r"(?=(?:^|\s+)[A-D]\.\s+|(?:^|\s+)[a-d]\)\s+)", raw_text)
            for part in parts:
                clean_part = part.strip()
                if not clean_part:
                    continue
                if re.match(r"^(?:[A-D]\.|[a-d]\))\s+", clean_part):
                    # Check if there is trailing passage attached to the last option
                    trailing_passage_m = re.search(r"(Read the following|Đọc đoạn văn|Đọc thông tin|Mark the letter).*", clean_part)
                    if trailing_passage_m:
                        passage_extracted = trailing_passage_m.group(0).strip()
                        clean_part = clean_part[:trailing_passage_m.start()].strip()
                        current_passage = passage_extracted

                    # Format option label to standard uppercase A. / B. / C. / D.
                    clean_part = re.sub(r"^([a-d])\)\s+", lambda m: f"{m.group(1).upper()}. ", clean_part)
                    current_q["options"].append(clean_part)

            # Map underlined letter to 0-based option index
            if underlined_letters:
                first_let = underlined_letters[0]
                idx = ord(first_let) - ord("A")
                current_q["correct"] = max(0, min(idx, len(current_q["options"]) - 1 if current_q["options"] else 0))
            continue

        # Check for numerical / fill-in answer: Trả lời: [value]
        m_ans = re.match(r"^(?:Trả lời|Đáp số|Đáp án)[:\s]*(\[[^\]]+\]|[^\n]+)", raw_text, re.IGNORECASE)
        if m_ans:
            ans_val = m_ans.group(1).strip()
            current_q["options"] = [f"A. {ans_val}"]
            current_q["correct"] = 0
            if not current_q["explanation"]:
                current_q["explanation"] = f"Đáp án chính xác: {ans_val}"
            continue

        # If still in QUESTION mode, append extra description lines or inline text
        if mode == "QUESTION":
            if (
                "Read the following" in raw_text
                or "Đọc đoạn văn" in raw_text
                or len(raw_text) > 150
            ):
                current_passage = raw_text
            else:
                current_q["question"] += "\n" + raw_text

    if current_q:
        questions.append(current_q)

    # Filter out empty exams
    if not questions:
        return None

    # Step 3: Post-process questions and fallback correct answers from explanation
    for q in questions:
        # If correct answer is not set or options are missing
        if not q["options"]:
            q["options"] = ["A. Đúng", "B. Sai"]
            q["correct"] = 0

        # Cross check explanation if correct answer was default
        if q["explanation"] and q.get("correct", 0) == 0:
            for opt_idx, opt in enumerate(q["options"]):
                opt_content = re.sub(r"^[A-D]\.\s*", "", opt).strip()
                if opt_content and f"Đúng – {opt_content}" in q["explanation"]:
                    q["correct"] = opt_idx
                    break
                elif opt_content and f"{opt_content} → Đúng" in q["explanation"]:
                    q["correct"] = opt_idx
                    break

    # Step 4: Merge Metadata Overrides (from Web scraping)
    meta = metadata_override or {}
    if meta.get("title") and not title:
        title = meta["title"]
    if meta.get("subject") and (not subject or subject == "Chung"):
        subject = normalize_subject(meta["subject"])

    final_title = title if title else (meta.get("title") or f"Bài tập OLM #{lesson_id or '12'}")
    final_subject = subject if subject else (normalize_subject(meta.get("subject")) or "Tiếng Anh")
    final_lesson_id = lesson_id or meta.get("lessonId") or str(abs(hash(final_title)))[:8]
    slug = slugify(final_title)
    exam_id = f"olm-{slug}-{final_lesson_id}"

    # Calculate reasonable duration
    duration = max(15, min(90, round(len(questions) * 1.5 / 5) * 5))

    exam_obj = {
        "id": exam_id,
        "lessonId": str(final_lesson_id),
        "title": f"OLM: {final_title}" if not final_title.upper().startswith("OLM") else final_title,
        "subject": final_subject,
        "grade": grade,
        "durationMinutes": duration,
        "difficulty": "Luyện tập OLM",
        "source": "OLM",
        "teacher": meta.get("teacher"),
        "deadline": meta.get("deadline"),
        "tags": [
            "OLM",
            final_subject,
            grade,
            "Trắc nghiệm OLM"
        ],
        "description": f"Bài tập trực tuyến OLM: {final_title}. Môn {final_subject} - {grade}. Tổng số {len(questions)} câu hỏi có đáp án và lời giải chi tiết.",
        "questions": questions
    }

    return exam_obj


def load_existing_exams(json_path: str) -> List[Dict[str, Any]]:
    """Load existing exams list from data/exams.json."""
    if not os.path.exists(json_path):
        return []
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list):
                return data
    except Exception as e:
        print(f"[!] Warning: Failed to load {json_path}: {e}")
    return []


def save_exams(json_path: str, exams: List[Dict[str, Any]]) -> bool:
    """Save exams list back to data/exams.json formatted cleanly."""
    os.makedirs(os.path.dirname(os.path.abspath(json_path)), exist_ok=True)
    try:
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(exams, f, ensure_ascii=False, indent=2)
            f.write("\n")
        return True
    except Exception as e:
        print(f"[!] Error writing to {json_path}: {e}")
        return False


def merge_new_exams(
    existing_exams: List[Dict[str, Any]],
    new_exams: List[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], int, int]:
    """
    Merge new exams into existing exams list, preventing duplicates by:
    - id
    - lessonId
    - (normalized title and subject)
    Returns (merged_list, added_count, updated_count).
    """
    merged = list(existing_exams)
    added_count = 0
    updated_count = 0

    for new_ex in new_exams:
        new_id = new_ex.get("id")
        new_lesson_id = new_ex.get("lessonId")
        new_title = slugify(new_ex.get("title", ""))

        matched_idx = -1
        for idx, ex in enumerate(merged):
            if new_id and ex.get("id") == new_id:
                matched_idx = idx
                break
            if new_lesson_id and ex.get("lessonId") and str(ex.get("lessonId")) == str(new_lesson_id):
                matched_idx = idx
                break
            if new_title and slugify(ex.get("title", "")) == new_title and ex.get("subject") == new_ex.get("subject"):
                matched_idx = idx
                break

        if matched_idx >= 0:
            # Update existing entry with newer questions/metadata
            merged[matched_idx] = new_ex
            updated_count += 1
        else:
            merged.append(new_ex)
            added_count += 1

    return merged, added_count, updated_count


def sync_local_docx_directory(
    docx_dir: str,
    exams_json_path: str,
    dry_run: bool = False
) -> None:
    """Scan and sync local .docx files directly without network."""
    print(f"[*] Scanning local docx directory: {docx_dir}")
    if not os.path.exists(docx_dir):
        print(f"[!] Directory not found: {docx_dir}")
        return

    parsed_exams = []
    for filename in sorted(os.listdir(docx_dir)):
        if filename.endswith(".docx") and not filename.startswith("~$"):
            full_path = os.path.join(docx_dir, filename)
            # Derive approximate lesson id from filename if present
            m_id = re.search(r"(\d{5,12})", filename)
            lid = m_id.group(1) if m_id else None
            exam = parse_docx_to_eduvault_exam(full_path, lesson_id=lid)
            if exam and exam.get("questions"):
                print(f"[+] Parsed '{filename}': {len(exam['questions'])} questions -> {exam['title']} ({exam['subject']})")
                parsed_exams.append(exam)

    if not parsed_exams:
        print("[*] No valid quiz exams found in local directory.")
        return

    existing = load_existing_exams(exams_json_path)
    merged, added, updated = merge_new_exams(existing, parsed_exams)
    print(f"[+] Merge summary: {added} new exams added, {updated} exams updated. Total: {len(merged)}")

    if not dry_run:
        save_exams(exams_json_path, merged)
        print(f"[✓] Saved updated exams to {exams_json_path}")
    else:
        print("[*] Dry run: changes not saved to disk.")


def run_sync_pipeline(
    exams_json_path: str = "data/exams.json",
    docx_dir: Optional[str] = None,
    single_lesson_id: Optional[str] = None,
    dry_run: bool = False
) -> bool:
    """Execute main OLM sync pipeline."""
    print("=" * 65)
    print("  EduVault OLM Synchronizer - Automated Extraction Pipeline")
    print("=" * 65)

    if docx_dir:
        sync_local_docx_directory(docx_dir, exams_json_path, dry_run=dry_run)
        return True

    session = get_authenticated_session()
    new_exams = []

    if single_lesson_id:
        print(f"[*] Processing single OLM lesson ID: {single_lesson_id}")
        docx_bytes = download_word_docx(session, single_lesson_id)
        if docx_bytes:
            exam = parse_docx_to_eduvault_exam(docx_bytes, lesson_id=single_lesson_id)
            if exam:
                new_exams.append(exam)
                try:
                    docx_save_dir = os.path.join(os.path.dirname(os.path.abspath(output_json)), "docx")
                    os.makedirs(docx_save_dir, exist_ok=True)
                    with open(os.path.join(docx_save_dir, f"{exam['id']}.docx"), "wb") as f_out:
                        f_out.write(docx_bytes)
                except Exception as docx_err:
                    print(f"[!] Warning: Failed to save raw docx for {exam['id']}: {docx_err}")
        else:
            print(f"[!] Could not download docx for ID {single_lesson_id}")
    else:
        # Step 1: Fetch list of assigned lessons from OLM
        lessons = fetch_assigned_lessons_from_olm(session)
        if not lessons:
            print("[!] No lessons found or authentication unavailable.")
            # Fallback: check if local Downloads directory has recent OLM docx files
            default_dl = os.path.expanduser("~/Downloads")
            if os.path.exists(default_dl):
                olm_files = [f for f in os.listdir(default_dl) if f.endswith(".docx") and "ap-an" in f]
                if olm_files:
                    print(f"[*] Fallback: Detected {len(olm_files)} OLM docx file(s) in {default_dl}. Syncing...")
                    sync_local_docx_directory(default_dl, exams_json_path, dry_run=dry_run)
                    return True
            return False

        # Step 2: Download each lesson's Word docx and parse into exam
        for item in lessons:
            lid = item["lessonId"]
            print(f"[*] Downloading Word docx for: {item.get('title')} (ID: {lid})...")
            docx_bytes = download_word_docx(session, lid)
            if not docx_bytes:
                print(f"[!] Skipping ID {lid}: docx download failed.")
                continue

            exam = parse_docx_to_eduvault_exam(docx_bytes, lesson_id=lid, metadata_override=item)
            if exam and exam.get("questions"):
                print(f"    -> Extracted {len(exam['questions'])} questions: {exam['title']} [{exam['subject']}]")
                new_exams.append(exam)
                try:
                    docx_save_dir = os.path.join(os.path.dirname(os.path.abspath(exams_json_path)), "docx")
                    os.makedirs(docx_save_dir, exist_ok=True)
                    with open(os.path.join(docx_save_dir, f"{exam['id']}.docx"), "wb") as f_out:
                        f_out.write(docx_bytes)
                except Exception as docx_err:
                    print(f"[!] Warning: Failed to save raw docx for {exam['id']}: {docx_err}")
            else:
                print(f"    -> Skipping ID {lid}: no question items extracted (homework/submission form).")

    if not new_exams:
        print("[*] No new exams to sync.")
        return True

    # Step 3: Merge with existing exams
    existing = load_existing_exams(exams_json_path)
    merged, added, updated = merge_new_exams(existing, new_exams)
    print("-" * 65)
    print(f"[+] Sync Complete: {added} new exam(s) added, {updated} updated. Total exams in repository: {len(merged)}")

    if not dry_run:
        saved = save_exams(exams_json_path, merged)
        if saved:
            print(f"[✓] Successfully wrote changes to {exams_json_path}")
        return saved
    else:
        print("[*] Dry-run complete. Exiting without modifying disk.")
        return True


def main():
    parser = argparse.ArgumentParser(description="Sync OLM assigned exams to EduVault repository.")
    parser.add_argument("--exams-json", default="data/exams.json", help="Path to data/exams.json")
    parser.add_argument("--docx-dir", default=None, help="Sync directly from a directory of .docx files")
    parser.add_argument("--single-id", default=None, help="Sync a single OLM lesson ID directly")
    parser.add_argument("--cookie", default=None, help="Override OLM cookie string")
    parser.add_argument("--dry-run", action="store_true", help="Parse and preview without modifying exams.json")

    args = parser.parse_args()

    if args.cookie:
        os.environ["OLM_COOKIES"] = args.cookie

    success = run_sync_pipeline(
        exams_json_path=args.exams_json,
        docx_dir=args.docx_dir,
        single_lesson_id=args.single_id,
        dry_run=args.dry_run
    )
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
