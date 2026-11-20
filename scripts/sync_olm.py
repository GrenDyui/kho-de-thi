#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EduVault - OLM Automatic Sync Pipeline & Deep Extraction Engine
Fetches assigned tests/lessons from OLM (olm.vn), downloads Word .docx format
(or falls back to direct API crawling with XOR decoding when Word download is disabled),
parses equations to LaTeX, extracts diagrams/images, handles True/False GDPT 2018 format,
generates genuine .docx with highlighted answers, and merges them into data/exams.json.
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
import html
import zipfile
import argparse
import unicodedata
from typing import Dict, List, Optional, Any, Tuple
import requests
import docx
from docx.shared import Pt, Inches, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_UNDERLINE
from docx.enum.table import WD_TABLE_ALIGNMENT
from PIL import Image

W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
M_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math'
OLM_XOR_KEY = "1047823200"

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
    for v in SUBJECT_NORMALIZATION.values():
        if v.lower() == clean.lower():
            return v
    return clean.title()


def xor_decode(encoded_str: str, key: str = OLM_XOR_KEY) -> str:
    """Decode OLM XOR-base64 encrypted string."""
    if not encoded_str:
        return ""
    try:
        import base64
        raw = base64.b64decode(encoded_str)
        kb = key.encode("utf-8")
        dec = bytes([b ^ kb[i % len(kb)] for i, b in enumerate(raw)])
        return dec.decode("utf-8", errors="replace")
    except Exception:
        return encoded_str


def strip_html_tags(html_str: str) -> str:
    """Strip HTML tags while preserving text content."""
    if not html_str:
        return ""
    txt = re.sub(r"<[^>]+>", " ", html_str)
    txt = html.unescape(txt)
    return re.sub(r"\s+", " ", txt).strip()


def omml_to_latex(elem) -> str:
    """Convert Office Math Markup Language (OMML) element to LaTeX math format."""
    tag = elem.tag.split('}')[-1]

    if tag in ('oMath', 'oMathPara'):
        return ''.join(omml_to_latex(child) for child in elem).strip()

    elif tag in ('e', 'num', 'den', 'sub', 'sup'):
        return ''.join(omml_to_latex(child) for child in elem)

    elif tag == 'r':
        txt = ''.join(t.text for t in elem.iter() if t.tag.endswith('}t') and t.text)
        return txt

    elif tag == 'f':
        # Fraction
        num_el = elem.find(f'{{{M_NS}}}num')
        den_el = elem.find(f'{{{M_NS}}}den')
        num = omml_to_latex(num_el) if num_el is not None else ''
        den = omml_to_latex(den_el) if den_el is not None else ''
        return f'\\frac{{{num}}}{{{den}}}'

    elif tag == 'rad':
        # Radical / square root
        deg_el = elem.find(f'.//{{{M_NS}}}deg')
        e_el = elem.find(f'{{{M_NS}}}e')
        e = omml_to_latex(e_el) if e_el is not None else ''
        deg = omml_to_latex(deg_el) if deg_el is not None else ''
        if deg.strip():
            return f'\\sqrt[{deg}]{{{e}}}'
        return f'\\sqrt{{{e}}}'

    elif tag == 'sSup':
        e_el = elem.find(f'{{{M_NS}}}e')
        sup_el = elem.find(f'{{{M_NS}}}sup')
        e = omml_to_latex(e_el) if e_el is not None else ''
        sup = omml_to_latex(sup_el) if sup_el is not None else ''
        return f'{{{e}}}^{{{sup}}}'

    elif tag == 'sSub':
        e_el = elem.find(f'{{{M_NS}}}e')
        sub_el = elem.find(f'{{{M_NS}}}sub')
        e = omml_to_latex(e_el) if e_el is not None else ''
        sub = omml_to_latex(sub_el) if sub_el is not None else ''
        return f'{{{e}}}_{{{sub}}}'

    elif tag == 'sSubSup':
        e_el = elem.find(f'{{{M_NS}}}e')
        sub_el = elem.find(f'{{{M_NS}}}sub')
        sup_el = elem.find(f'{{{M_NS}}}sup')
        e = omml_to_latex(e_el) if e_el is not None else ''
        sub = omml_to_latex(sub_el) if sub_el is not None else ''
        sup = omml_to_latex(sup_el) if sup_el is not None else ''
        return f'{{{e}}}_{{{sub}}}^{{{sup}}}'

    elif tag == 'd':
        # Delimiters (brackets, braces, parens)
        dPr = elem.find(f'{{{M_NS}}}dPr')
        beg = '('
        end = ')'
        if dPr is not None:
            beg_el = dPr.find(f'{{{M_NS}}}begChr')
            if beg_el is not None:
                beg = beg_el.attrib.get(f'{{{M_NS}}}val', '(')
            end_el = dPr.find(f'{{{M_NS}}}endChr')
            if end_el is not None:
                end = end_el.attrib.get(f'{{{M_NS}}}val', ')')
        e_el = elem.find(f'{{{M_NS}}}e')
        e = omml_to_latex(e_el) if e_el is not None else ''
        if beg == '{' and not end:
            return f'\\begin{{cases}} {e} \\end{{cases}}'
        left_str = f'\\left\\{beg}' if beg in ('{', '}') else (f'\\left{beg}' if beg else '\\left.')
        right_str = f'\\right\\{end}' if end in ('{', '}') else (f'\\right{end}' if end else '\\right.')
        return f'{left_str} {e} {right_str}'

    elif tag == 'm':
        # Matrix / equation array
        rows = []
        for r_child in elem:
            if r_child.tag.endswith('}mr'):
                cells = [omml_to_latex(c) for c in r_child if c.tag.endswith('}e')]
                cells = [c for c in cells if c.strip()]
                rows.append(' & '.join(cells))
        return ' \\\\ '.join(rows)

    elif tag == 'bar':
        e_el = elem.find(f'{{{M_NS}}}e')
        e = omml_to_latex(e_el) if e_el is not None else ''
        return f'\\overline{{{e}}}'

    else:
        txt = ''.join(t.text for t in elem.iter() if t.tag.endswith('}t') and t.text)
        return txt


def get_paragraph_text_and_underlines(p) -> Tuple[str, List[str]]:
    """Extract full paragraph text (converting OMML math to LaTeX) and identify underlined runs."""
    parts = []
    underlined_texts = []

    for child in p._element:
        tag = child.tag
        if tag.endswith('}r'):
            is_u = False
            for u in child.iter():
                if u.tag.endswith('}u'):
                    val = u.attrib.get(f'{{{W_NS}}}val', 'single')
                    if val != 'none':
                        is_u = True
                        break
            run_text = ''.join(t.text for t in child.iter() if t.tag.endswith('}t') and t.text)
            if run_text:
                parts.append(run_text)
                if is_u:
                    underlined_texts.append(run_text.strip())
        elif tag.endswith('}oMath') or tag.endswith('}oMathPara'):
            latex = omml_to_latex(child)
            if latex:
                parts.append(f' ${latex}$ ')
        elif tag.endswith('}pPr'):
            continue
        else:
            any_text = ''.join(t.text for t in child.iter() if t.tag.endswith('}t') and t.text)
            if any_text:
                parts.append(any_text)

    full_text = ''.join(parts).strip()
    return full_text, underlined_texts


def extract_media_from_docx_bytes(docx_bytes: bytes, exam_id: str, images_base_dir: str) -> Dict[str, str]:
    """Extract media files (PNG/JPEG/WMF) from docx binary into images directory."""
    img_map = {}
    try:
        exam_img_dir = os.path.join(images_base_dir, exam_id)
        os.makedirs(exam_img_dir, exist_ok=True)
        with zipfile.ZipFile(io.BytesIO(docx_bytes)) as z:
            media_files = [n for n in z.namelist() if n.startswith('word/media/')]
            for mf in media_files:
                base_name = os.path.basename(mf)
                stem, ext = os.path.splitext(base_name)
                ext = ext.lower()
                data = z.read(mf)
                out_name = f"{stem}.png"
                out_path = os.path.join(exam_img_dir, out_name)

                if ext in ('.png', '.jpg', '.jpeg'):
                    with open(out_path, 'wb') as f_out:
                        f_out.write(data)
                    img_map[mf] = f"data/images/{exam_id}/{out_name}"
                elif ext == '.wmf':
                    # Convert WMF to PNG via PIL
                    try:
                        im = Image.open(io.BytesIO(data))
                        im.save(out_path, 'PNG')
                        img_map[mf] = f"data/images/{exam_id}/{out_name}"
                    except Exception:
                        pass
    except Exception as e:
        print(f"[!] Warning: Media extraction failed: {e}")
    return img_map


def parse_cookie_string(raw: str) -> Dict[str, str]:
    """Parse cookie string or JSON string into cookie dictionary."""
    if not raw:
        return {}
    raw = raw.strip()
    if raw.startswith("{") and raw.endswith("}"):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return {str(k): str(v) for k, v in parsed.items()}
        except Exception:
            pass

    cookies = {}
    for part in raw.split(";"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            cookies[k.strip()] = v.strip()
    return cookies


def get_authenticated_session() -> requests.Session:
    """Create and configure authenticated session with OLM."""
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "Connection": "keep-alive"
    })

    env_cookies = [
        os.environ.get("OLM_COOKIES"),
        os.environ.get("OLM_COOKIE"),
        "XSRF-TOKEN=1veulN4qgJksNCPHL5TkElo3Xv1QygpdB54uSSth; access_token=504290667d7de1a9d8c1d7273c75a9b5489b40cf; refresh_token=ddaa2782e59391eaab05edcd01a78bfbea035535"
    ]

    for cookie_val in env_cookies:
        if not cookie_val:
            continue
        cookies = parse_cookie_string(cookie_val)
        for k, v in cookies.items():
            session.cookies.set(k, v, domain="olm.vn")

    return session


def fetch_assigned_lessons_from_olm(session: requests.Session) -> List[Dict[str, Any]]:
    """Fetch assigned courseware lessons for the authenticated student."""
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

                subj_title = item.get("subject", {}).get("title") if isinstance(item.get("subject"), dict) else ""
                user_name = item.get("user", {}).get("name") if isinstance(item.get("user"), dict) else None
                url = item.get("_url") or item.get("url") or f"https://olm.vn/chu-de/{item.get('alias', 'bai-tap')}-{id_skill}"
                no_dl = options.get("no_download_word", 0)

                cate = item.get("cate") or {}
                cate_type = cate.get("type")
                prefix = cate.get("prefix") or ""
                is_essay = (cate_type == 6 or "[Tự luận]" in prefix)

                lessons.append({
                    "lessonId": id_skill,
                    "title": title.strip(),
                    "subject": subj_title.strip() if subj_title else "",
                    "teacher": user_name,
                    "duration": duration,
                    "deadline": item.get("expired"),
                    "url": url,
                    "noDownload": bool(no_dl),
                    "isEssay": is_essay,
                    "typePrefix": prefix
                })
            print(f"[+] Found {len(lessons)} assigned exam(s) from OLM Student API.")
            if lessons:
                return lessons
    except Exception as e:
        print(f"[!] OLM API notice: {e}")

    return lessons


def download_word_docx(session: requests.Session, lesson_id: str) -> Optional[bytes]:
    """Download Word .docx file via /download-word-for-user endpoint."""
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
    if content.startswith(b"PK\x03\x04"):
        return content

    try:
        data = resp.json()
        if isinstance(data, dict) and data.get("file"):
            file_url = data["file"].strip()
            if "olm.vn" in file_url:
                f_resp = session.get(file_url, timeout=35, allow_redirects=True)
                if f_resp.status_code == 200 and f_resp.content.startswith(b"PK\x03\x04"):
                    return f_resp.content
    except Exception:
        pass

    return None


def generate_genuine_docx(exam: Dict[str, Any], output_path: str, desktop_path: Optional[str] = None):
    """Generate a genuine OpenXML .docx file with bold blue underlined correct answers and 10-col answer key."""
    doc = docx.Document()
    for s in doc.sections:
        s.top_margin = Inches(0.75)
        s.bottom_margin = Inches(0.75)
        s.left_margin = Inches(0.75)
        s.right_margin = Inches(0.75)

    title = exam.get("title", "ĐỀ THI TRẮC NGHIỆM").replace("OLM: ", "").strip()
    subject = exam.get("subject", "Chung")
    grade = exam.get("grade", 12)
    questions = exam.get("questions", [])

    # Header
    p_h = doc.add_paragraph()
    r_h = p_h.add_run("BỘ GIÁO DỤC VÀ ĐÀO TẠO - OLM EDUVAULT")
    r_h.font.name = "Times New Roman"
    r_h.font.size = Pt(11)
    r_h.font.color.rgb = RGBColor(100, 100, 100)

    p_t = doc.add_paragraph()
    r_t = p_t.add_run(f"ĐỀ THI: {title.upper()}")
    r_t.font.name = "Times New Roman"
    r_t.font.size = Pt(16)
    r_t.font.bold = True
    r_t.font.color.rgb = RGBColor(0, 51, 102)
    p_t.alignment = WD_ALIGN_PARAGRAPH.CENTER

    p_sub = doc.add_paragraph()
    r_sub = p_sub.add_run(f"Môn: {subject} | Lớp: {grade} | Số câu: {len(questions)} câu | Thời gian: {exam.get('duration', 45)} phút\n(Kèm Đáp án chính xác & Lời giải chi tiết)")
    r_sub.font.name = "Times New Roman"
    r_sub.font.size = Pt(11)
    r_sub.font.italic = True
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER

    doc.add_paragraph("=" * 60).alignment = WD_ALIGN_PARAGRAPH.CENTER

    letters = ["A", "B", "C", "D"]
    for q in questions:
        p_q = doc.add_paragraph()
        r_lbl = p_q.add_run(f"Câu {q['id']}: ")
        r_lbl.font.name = "Times New Roman"
        r_lbl.font.size = Pt(12)
        r_lbl.font.bold = True
        r_lbl.font.color.rgb = RGBColor(0, 51, 102)

        r_txt = p_q.add_run(q["question"])
        r_txt.font.name = "Times New Roman"
        r_txt.font.size = Pt(12)

        if q.get("type") == "true_false" and q.get("items"):
            for it in q["items"]:
                p_it = doc.add_paragraph()
                p_it.paragraph_format.left_indent = Inches(0.25)
                lbl_it = f"{it.get('label', 'a')}) "
                r_lit = p_it.add_run(lbl_it)
                r_lit.font.name = "Times New Roman"
                r_lit.font.size = Pt(12)
                r_lit.font.bold = True
                if it.get("correct"):
                    r_lit.font.underline = True
                    r_lit.font.color.rgb = RGBColor(0, 102, 204)

                r_tit = p_it.add_run(it.get("text", ""))
                r_tit.font.name = "Times New Roman"
                r_tit.font.size = Pt(12)
        elif q.get("type") == "short_answer":
            p_ans = doc.add_paragraph()
            p_ans.paragraph_format.left_indent = Inches(0.25)
            r_ans = p_ans.add_run(f"Trả lời: [{q.get('correctAnswer', '...')}]")
            r_ans.font.name = "Times New Roman"
            r_ans.font.size = Pt(12)
            r_ans.font.bold = True
            r_ans.font.color.rgb = RGBColor(0, 102, 204)
        else:
            for opt_idx, opt in enumerate(q.get("options", [])):
                p_opt = doc.add_paragraph()
                p_opt.paragraph_format.left_indent = Inches(0.25)
                is_corr = (opt_idx == q.get("correct"))
                r_opt = p_opt.add_run(opt)
                r_opt.font.name = "Times New Roman"
                r_opt.font.size = Pt(12)
                if is_corr:
                    r_opt.font.bold = True
                    r_opt.font.underline = True
                    r_opt.font.color.rgb = RGBColor(0, 102, 204)

        if q.get("explanation"):
            p_exp = doc.add_paragraph()
            p_exp.paragraph_format.left_indent = Inches(0.25)
            r_exp_lbl = p_exp.add_run("Lời giải chi tiết: ")
            r_exp_lbl.font.name = "Times New Roman"
            r_exp_lbl.font.size = Pt(11)
            r_exp_lbl.font.bold = True
            r_exp_lbl.font.color.rgb = RGBColor(0, 128, 0)

            r_exp_txt = p_exp.add_run(q["explanation"])
            r_exp_txt.font.name = "Times New Roman"
            r_exp_txt.font.size = Pt(11)
            r_exp_txt.font.italic = True

    # Answer summary table (10 columns)
    p_end = doc.add_paragraph("\nBẢNG ĐÁP ÁN")
    r_end = p_end.runs[0]
    r_end.font.name = "Times New Roman"
    r_end.font.size = Pt(14)
    r_end.font.bold = True
    r_end.font.color.rgb = RGBColor(0, 51, 102)
    p_end.alignment = WD_ALIGN_PARAGRAPH.CENTER

    total_q = len(questions)
    cols = 10
    rows = ((total_q + cols - 1) // cols) * 2

    table = doc.add_table(rows=rows, cols=cols)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER

    for chunk_idx in range((total_q + cols - 1) // cols):
        row_q = chunk_idx * 2
        row_a = chunk_idx * 2 + 1
        for c in range(cols):
            q_idx = chunk_idx * cols + c
            cell_q = table.cell(row_q, c)
            cell_a = table.cell(row_a, c)

            if q_idx < total_q:
                q_item = questions[q_idx]
                cell_q.text = str(q_item["id"])
                p_cq = cell_q.paragraphs[0]
                p_cq.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p_cq.runs[0].font.name = "Times New Roman"
                p_cq.runs[0].font.size = Pt(10)
                p_cq.runs[0].font.bold = True

                if q_item.get("type") == "true_false" and q_item.get("items"):
                    corr_letter = "/".join("Đ" if it.get("correct") else "S" for it in q_item["items"])
                elif q_item.get("type") == "short_answer":
                    corr_letter = str(q_item.get("correctAnswer", "-"))
                else:
                    corr_letter = letters[q_item["correct"]] if q_item.get("correct", 0) < len(letters) else "?"

                cell_a.text = corr_letter
                p_ca = cell_a.paragraphs[0]
                p_ca.alignment = WD_ALIGN_PARAGRAPH.CENTER
                p_ca.runs[0].font.name = "Times New Roman"
                p_ca.runs[0].font.size = Pt(11)
                p_ca.runs[0].font.bold = True
                p_ca.runs[0].font.color.rgb = RGBColor(204, 0, 0)

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    doc.save(output_path)
    if desktop_path:
        try:
            os.makedirs(os.path.dirname(os.path.abspath(desktop_path)), exist_ok=True)
            doc.save(desktop_path)
        except Exception:
            pass


def crawl_blocked_exam_from_olm(
    session: requests.Session,
    lesson_id: str,
    meta: Dict[str, Any],
    exams_json_path: str
) -> Optional[Dict[str, Any]]:
    """Crawl a lesson directly from OLM student web API when Word export is disabled (HTTP 403)."""
    target_url = meta.get("url") or f"https://olm.vn/chu-de/bai-tap-{lesson_id}"
    print(f"[*] Fallback Crawler: Requesting topic page {target_url}...")

    try:
        r = session.get(target_url, timeout=30)
        if r.status_code != 200:
            print(f"[!] Fallback Crawler: Topic page returned HTTP {r.status_code}")
            return None
    except Exception as e:
        print(f"[!] Fallback Crawler: Page request failed: {e}")
        return None

    # Extract quiz IDs
    m_quizzes = re.search(r'list_id_quiz\s*:\s*\[([\s\S]*?)\]', r.text)
    if not m_quizzes:
        print(f"[!] Fallback Crawler: Could not find list_id_quiz in HTML.")
        return None

    quizzes = re.findall(r'["\'](\d+)["\']', m_quizzes.group(1))
    if not quizzes:
        print(f"[!] Fallback Crawler: No quiz IDs extracted.")
        return None

    # Extract subject, category, cv_q
    m_subj = re.search(r'id_subject\s*:\s*(\d+)', r.text)
    id_subject = int(m_subj.group(1)) if m_subj else 43

    m_cv_q = re.search(r'cv_q\s*:\s*["\']?([^,"\n\r}]+)', r.text)
    cv_q = m_cv_q.group(1).strip() if m_cv_q else ""

    print(f"[+] Fallback Crawler: Found {len(quizzes)} question IDs (Subject ID: {id_subject}). Requesting payload...")

    post_url = "https://olm.vn/course/question/get-question-of-ids"
    headers = {
        "Content-Type": "application/json",
        "X-XSRF-TOKEN": session.cookies.get("XSRF-TOKEN", ""),
        "Referer": target_url
    }
    payload = {
        "qlib_list": quizzes,
        "id_subject": id_subject,
        "id_skill": int(lesson_id),
        "cv_q": cv_q,
        "encodeXORBase64": True
    }

    try:
        res = session.post(post_url, headers=headers, json=payload, timeout=45)
        if res.status_code != 200:
            print(f"[!] Fallback Crawler: API returned HTTP {res.status_code}")
            return None
        raw_questions = res.json()
    except Exception as e:
        print(f"[!] Fallback Crawler: Failed to fetch questions: {e}")
        return None

    print(f"[+] Fallback Crawler: Successfully received {len(raw_questions)} questions from OLM API!")

    parsed_questions = []
    letters = ["A", "B", "C", "D"]

    for idx, rq in enumerate(raw_questions):
        c_html = xor_decode(rq.get("content"))
        ol_idx = c_html.find("<ol")
        if ol_idx != -1:
            q_html = c_html[:ol_idx]
            ol_html = c_html[ol_idx:]
        else:
            q_html = c_html
            ol_html = ""

        q_text = strip_html_tags(q_html)
        opts = []
        correct_idx = 0

        if ol_html:
            li_matches = re.findall(r'<li\b([^>]*)>([\s\S]*?)<\/li>', ol_html)
            for l_idx, (attrs, li_inner) in enumerate(li_matches):
                if "correctAnswer" in attrs:
                    correct_idx = l_idx
                opt_text = strip_html_tags(li_inner)
                letter = letters[l_idx] if l_idx < len(letters) else chr(ord('A') + l_idx)
                opts.append(f"{letter}. {opt_text}")

        exp = ""
        if rq.get("hint"):
            exp = strip_html_tags(xor_decode(rq.get("hint")))

        parsed_questions.append({
            "id": idx + 1,
            "question": q_text if q_text else f"Chọn phương án đúng cho câu {idx + 1}:",
            "options": opts,
            "correct": correct_idx,
            "explanation": exp
        })

    title = meta.get("title") or f"Bài tập OLM #{lesson_id}"
    subj = normalize_subject(meta.get("subject"))
    slug = slugify(title)
    exam_id = f"olm-{slug}-{lesson_id}"

    exam = {
        "id": exam_id,
        "title": f"OLM: {title}",
        "subject": subj,
        "grade": 12,
        "duration": meta.get("duration", 45),
        "teacher": meta.get("teacher"),
        "source": "OLM",
        "isSchool": False,
        "tags": ["OLM", subj, "Tự động trích xuất"],
        "questions": parsed_questions
    }

    docx_dir = os.path.join(os.path.dirname(os.path.abspath(exams_json_path)), "docx")
    out_docx = os.path.join(docx_dir, f"{exam_id}.docx")
    clean_title = re.sub(r'[\\/*?:"<>|]', "", title)
    desktop_docx = os.path.join(r"C:\Users\QuocDuy\OneDrive\Desktop\dự án", f"{clean_title} (Có Đáp Án).docx")

    generate_genuine_docx(exam, out_docx, desktop_docx)
    print(f"[✓] Generated and saved genuine docx to {out_docx} and Desktop dự án!")

    return exam


def parse_docx_to_eduvault_exam(
    docx_bytes_or_path: Any,
    lesson_id: Optional[str] = None,
    metadata_override: Optional[Dict[str, Any]] = None,
    images_dir: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Parse an OLM Word .docx document into EduVault JSON exam format.
    Extracts formulas to LaTeX, parses True/False items, detects images, and resolves answers.
    """
    try:
        if isinstance(docx_bytes_or_path, (bytes, bytearray)):
            doc = docx.Document(io.BytesIO(docx_bytes_or_path))
            raw_bytes = bytes(docx_bytes_or_path)
        else:
            doc = docx.Document(docx_bytes_or_path)
            with open(docx_bytes_or_path, 'rb') as f_in:
                raw_bytes = f_in.read()
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

    meta = metadata_override or {}
    final_title = title if title else (meta.get("title") or f"Bài tập OLM #{lesson_id or '12'}")
    final_subject = subject if subject else (normalize_subject(meta.get("subject")) or "Tiếng Anh")
    final_lesson_id = lesson_id or meta.get("lessonId") or str(abs(hash(final_title)))[:8]
    slug = slugify(final_title)
    exam_id = f"olm-{slug}-{final_lesson_id}"

    # Extract media from docx
    img_map = {}
    if images_dir:
        img_map = extract_media_from_docx_bytes(raw_bytes, exam_id, images_dir)

    # Step 2: Parse Questions, Options, Answers, Explanations, and Passages
    questions = []
    current_q = None
    mode = None
    current_passage = ""

    for p in doc.paragraphs:
        raw_text, p_underlines = get_paragraph_text_and_underlines(p)
        if not raw_text:
            continue

        # Check if new question begins: 'Câu 1.', 'Câu 2:', 'Câu 3 '
        m_q = re.match(r"^Câu\s+(\d+)(?:\[[A-Z0-9_-]+\])?[\.:\s]+(.*)", raw_text, re.DOTALL | re.IGNORECASE)
        if m_q:
            if current_q:
                questions.append(current_q)

            q_num = int(m_q.group(1))
            q_text = m_q.group(2).strip()

            if current_passage:
                q_text = f"<div class=\"passage mb-4 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 text-sm leading-relaxed\">{current_passage}</div>{q_text}".strip()
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
            if (
                "Read the following" in raw_text
                or "Đọc đoạn văn" in raw_text
                or "Đọc thông tin" in raw_text
                or len(raw_text) > 120
            ) and not raw_text.startswith("BÀI LUYỆN TẬP") and not raw_text.startswith("Họ, tên:"):
                current_passage = raw_text
            continue

        # Check if Explanation starts
        if re.match(r"^(?:Hướng dẫn giải|Lời giải|Giải thích)[:\s]*", raw_text, re.IGNORECASE):
            mode = "EXPLANATION"
            exp_text = re.sub(r"^(?:Hướng dẫn giải|Lời giải|Giải thích)[:\s]*", "", raw_text, flags=re.IGNORECASE).strip()
            if exp_text:
                current_q["explanation"] = exp_text
            continue

        if mode == "EXPLANATION":
            if current_q["explanation"]:
                current_q["explanation"] += "\n" + raw_text
            else:
                current_q["explanation"] = raw_text
            continue

        # Numerical Answer: 'Trả lời: [5]'
        m_num = re.match(r"^(?:Trả lời|Đáp số|Đáp án)[:\s]*\[(.*?)\]", raw_text, re.IGNORECASE)
        if m_num:
            ans_val = m_num.group(1).strip()
            current_q["type"] = "short_answer"
            current_q["options"] = [f"Đáp số: {ans_val}"]
            current_q["correctAnswer"] = ans_val
            current_q["correct"] = 0
            continue

        # True / False Sub-items: a) ... b) ... c) ... d) ...
        m_tf = re.match(r"^([a-d])\)\s*(.*)", raw_text, re.IGNORECASE)
        if m_tf:
            mode = "TF_ITEMS"
            let = m_tf.group(1).lower()
            text_tf = m_tf.group(2).strip()
            current_q["type"] = "true_false"
            if "items" not in current_q:
                current_q["items"] = []

            is_correct = False
            pattern_tf_flag = r"[\.\s,;]*[\(\[]\s*([TtĐđFfSs]|Đúng|Sai|True|False)\s*[\)\]][\.\s,;]*$"
            m_flag = re.search(pattern_tf_flag, text_tf, re.I)
            if m_flag:
                flag_char = m_flag.group(1).upper()
                is_correct = flag_char in ('T', 'Đ', 'ĐÚNG', 'TRUE')
            elif any(let in u.lower() for u in p_underlines):
                is_correct = True
            elif 'Đúng' in text_tf or 'đúng' in text_tf:
                is_correct = True

            clean_tf_text = re.sub(pattern_tf_flag, "", text_tf, flags=re.I).strip()

            current_q["items"].append({
                "label": let,
                "text": clean_tf_text,
                "correct": is_correct
            })
            continue

        # Multiple choice options: A. ... B. ...
        has_options = bool(re.search(r"([A-D])\.\s*", raw_text))
        if has_options:
            mode = "OPTIONS"
            matches = re.findall(r"([A-D])\.\s*(.*?)(?=(?:[A-D]\.|$))", raw_text, re.S)
            if matches:
                for let, content in matches:
                    clean_c = content.strip()
                    let_up = let.upper()
                    idx = ord(let_up) - ord("A")
                    current_q["options"].append(f"{let_up}. {clean_c}")
                    if any(let_up in u or u.startswith(let_up + '.') for u in p_underlines):
                        current_q["correct"] = idx
            continue

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

    if not questions:
        return None

    # Step 3: Post-process questions and cross-check explanations for True/False items
    for q in questions:
        if q.get("type") == "true_false" and q.get("items") and q.get("explanation"):
            exp = q["explanation"]
            for item in q["items"]:
                lbl = item["label"]
                m_exp_tf = re.search(r'(?:^|[\n\.\;\s])' + lbl + r'[\)\.]\s*(Đúng|Sai|True|False|[ĐđSsTtFf])\b', exp, re.I)
                if m_exp_tf:
                    val_word = m_exp_tf.group(1).lower()
                    if val_word in ('đúng', 'true', 'đ', 't'):
                        item['correct'] = True
                    elif val_word in ('sai', 'false', 's', 'f'):
                        item['correct'] = False

        if not q.get("options") and not q.get("items"):
            q["options"] = ["A. Đúng", "B. Sai"]
            q["correct"] = 0

    return {
        "id": exam_id,
        "title": f"OLM: {final_title}",
        "subject": final_subject,
        "grade": int(re.search(r"\d+", grade).group(0)) if re.search(r"\d+", grade) else 12,
        "duration": meta.get("duration", 45),
        "teacher": meta.get("teacher"),
        "source": "OLM",
        "isSchool": False,
        "tags": ["OLM", final_subject, f"GV: {meta.get('teacher') or 'OLM'}"],
        "questions": questions
    }


def load_existing_exams(path: str) -> List[Dict[str, Any]]:
    """Load existing exams list from data/exams.json."""
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, list) else []
    except Exception as e:
        print(f"[!] Warning: Could not read {path}: {e}")
        return []


def merge_new_exams(
    existing: List[Dict[str, Any]],
    new_exams: List[Dict[str, Any]]
) -> Tuple[List[Dict[str, Any]], int, int]:
    """Merge new exams with existing exams repository."""
    exam_map = {e["id"]: e for e in existing if "id" in e}
    added_count = 0
    updated_count = 0

    for exam in new_exams:
        eid = exam["id"]
        # Match by exact id or by lesson id
        m_id = re.search(r"(\d{8,})", eid)
        lid = m_id.group(1) if m_id else None

        target_id = None
        if eid in exam_map:
            target_id = eid
        elif lid:
            for existing_id in exam_map.keys():
                if existing_id.endswith(f"-{lid}") or existing_id == f"olm-{lid}":
                    target_id = existing_id
                    break

        if target_id:
            exam["id"] = target_id
            exam_map[target_id].update(exam)
            updated_count += 1
        else:
            exam_map[eid] = exam
            added_count += 1

    return list(exam_map.values()), added_count, updated_count


def find_existing_exam_for_lesson(item: Dict[str, Any], existing_exams: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Check if an assigned OLM lesson is already synchronized in the repository with valid questions."""
    lid = str(item.get("lessonId", "")).strip()
    title = str(item.get("title", "")).strip().lower()

    for ex in existing_exams:
        eid = str(ex.get("id", ""))
        etitle = str(ex.get("title", "")).lower()
        if lid and (eid.endswith(f"-{lid}") or eid == f"olm-{lid}" or f"-{lid}-" in eid or eid == lid or lid in eid):
            return ex
        if title and len(title) > 6 and (title in etitle or etitle in title):
            return ex
    return None


def save_exams(path: str, exams: List[Dict[str, Any]]) -> bool:
    """Save exams list back to data/exams.json."""
    try:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(exams, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[!] Error writing to {path}: {e}")
        return False


def sync_local_docx_directory(
    docx_dir: str,
    exams_json_path: str,
    dry_run: bool = False
) -> bool:
    """Scan and sync local .docx files directly without network."""
    print(f"[*] Scanning local docx directory: {docx_dir}")
    if not os.path.exists(docx_dir):
        print(f"[!] Directory not found: {docx_dir}")
        return False

    images_base_dir = os.path.join(os.path.dirname(os.path.abspath(exams_json_path)), "images")
    parsed_exams = []
    for filename in sorted(os.listdir(docx_dir)):
        if not filename.endswith(".docx") or filename.startswith("~$"):
            continue

        full_path = os.path.join(docx_dir, filename)
        stem = filename[:-5]
        m_id = re.search(r"(\d{8,})", stem)
        lesson_id = m_id.group(1) if m_id else None

        exam = parse_docx_to_eduvault_exam(full_path, lesson_id=lesson_id, images_dir=images_base_dir)
        if exam and exam.get("questions"):
            print(f"  [+] Parsed {len(exam['questions'])} questions: {exam['title']} [{exam['subject']}]")
            parsed_exams.append(exam)
        else:
            print(f"  [-] Skipped {filename}: no questions extracted.")

    if not parsed_exams:
        print("[!] No valid exams parsed from directory.")
        return False

    existing = load_existing_exams(exams_json_path)
    merged, added, updated = merge_new_exams(existing, parsed_exams)
    print(f"[+] Local Sync: {added} new exam(s) added, {updated} updated. Total exams: {len(merged)}")

    if not dry_run:
        save_exams(exams_json_path, merged)
        print(f"[✓] Saved updated exams to {exams_json_path}")

    return True


def run_sync_pipeline(
    exams_json_path: str = "data/exams.json",
    docx_dir: Optional[str] = None,
    single_lesson_id: Optional[str] = None,
    force: bool = False,
    dry_run: bool = False
) -> bool:
    """Execute main OLM sync pipeline."""
    print("=" * 65)
    print("  EduVault OLM Synchronizer - Automated Extraction Pipeline")
    print("=" * 65)

    images_base_dir = os.path.join(os.path.dirname(os.path.abspath(exams_json_path)), "images")

    if docx_dir:
        sync_local_docx_directory(docx_dir, exams_json_path, dry_run=dry_run)
        return True

    existing = load_existing_exams(exams_json_path)
    session = get_authenticated_session()
    new_exams = []

    if single_lesson_id:
        print(f"[*] Processing single OLM lesson ID: {single_lesson_id}")
        docx_bytes = download_word_docx(session, single_lesson_id)
        if docx_bytes:
            exam = parse_docx_to_eduvault_exam(docx_bytes, lesson_id=single_lesson_id, images_dir=images_base_dir)
            if exam:
                new_exams.append(exam)
                try:
                    docx_save_dir = os.path.join(os.path.dirname(os.path.abspath(exams_json_path)), "docx")
                    os.makedirs(docx_save_dir, exist_ok=True)
                    with open(os.path.join(docx_save_dir, f"{exam['id']}.docx"), "wb") as f_out:
                        f_out.write(docx_bytes)
                except Exception as docx_err:
                    print(f"[!] Warning: Failed to save raw docx for {exam['id']}: {docx_err}")
        else:
            print(f"[*] Fallback: Initiating web/API crawler for blocked lesson ID {single_lesson_id}...")
            exam = crawl_blocked_exam_from_olm(session, single_lesson_id, {"lessonId": single_lesson_id}, exams_json_path)
            if exam:
                new_exams.append(exam)
    else:
        # Step 1: Fetch list of assigned lessons from OLM
        lessons = fetch_assigned_lessons_from_olm(session)
        if not lessons:
            print("[!] No lessons found or authentication unavailable.")
            return False

        # Step 2: Download each lesson's Word docx (or crawl if blocked)
        for item in lessons:
            lid = item["lessonId"]
            title = item.get("title", f"Bài tập {lid}")

            # Check if this assignment is an essay/homework submission form
            if item.get("isEssay") or item.get("typePrefix") == "[Tự luận]":
                print(f"[-] Bỏ qua bài tự luận/nộp bài: {title} (ID: {lid})")
                continue

            # Check if already present and updated in repository
            if not force:
                matched = find_existing_exam_for_lesson(item, existing)
                if matched and len(matched.get("questions", [])) > 0:
                    print(f"[✓] Bỏ qua (Đã cập nhật): {title} (ID: {lid}) - Đã có {len(matched['questions'])} câu.")
                    continue

            print(f"[*] Processing lesson: {title} (ID: {lid})...")
            docx_bytes = download_word_docx(session, lid)

            if not docx_bytes:
                print(f"[*] Fallback: Initiating web/API crawler for blocked lesson ID {lid} ({title})...")
                exam = crawl_blocked_exam_from_olm(session, lid, item, exams_json_path)
                if exam and exam.get("questions"):
                    print(f"    -> [Crawled] Extracted {len(exam['questions'])} questions: {exam['title']} [{exam['subject']}]")
                    new_exams.append(exam)
                else:
                    print(f"[!] Skipping ID {lid}: fallback crawler could not extract questions.")
                continue

            exam = parse_docx_to_eduvault_exam(docx_bytes, lesson_id=lid, metadata_override=item, images_dir=images_base_dir)
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
        print("[*] No new exams to sync (tất cả các bài đều đã cập nhật).")
        return True

    # Step 3: Merge with existing exams
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
    parser.add_argument("--force", action="store_true", help="Bắt buộc quét và tải lại toàn bộ, không bỏ qua bài cũ")
    parser.add_argument("--dry-run", action="store_true", help="Parse and preview without modifying exams.json")

    args = parser.parse_args()

    if args.cookie:
        os.environ["OLM_COOKIES"] = args.cookie

    success = run_sync_pipeline(
        exams_json_path=args.exams_json,
        docx_dir=args.docx_dir,
        single_lesson_id=args.single_id,
        force=args.force,
        dry_run=args.dry_run
    )
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
