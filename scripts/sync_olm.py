#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EduVault - OLM Automatic Sync Pipeline V2 (LaTeX Math + Image Extraction + True/False GDPT 2018)
Fetches assigned tests/lessons from OLM (olm.vn), downloads the Word .docx format,
converts OMML math to LaTeX, extracts all diagrams/images to data/images/,
accurately marks True/False questions, and merges them into data/exams.json.
"""

import os
import sys
import re
import json
import io
import zipfile
import argparse
import unicodedata
import xml.etree.ElementTree as ET
from typing import Dict, List, Optional, Any, Tuple
import requests

DOCX_NAMESPACES = (
    'xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" '
    'xmlns:cx="http://schemas.microsoft.com/office/drawing/2014/chartex" '
    'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" '
    'xmlns:o="urn:schemas-microsoft-com:office:office" '
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
    'xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" '
    'xmlns:v="urn:schemas-microsoft-com:vml" '
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" '
    'xmlns:w10="urn:schemas-microsoft-com:office:word" '
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
    'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" '
    'xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" '
    'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
)

OMML_NS = {
    'm': 'http://schemas.openxmlformats.org/officeDocument/2006/math',
    'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'v': 'urn:schemas-microsoft-com:vml',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'
}

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


def normalize_grade(val: Any) -> str:
    """Ensure grade is always formatted as a string like 'Lớp 12'."""
    if not val:
        return "Lớp 12"
    s = str(val).strip()
    if s.isdigit():
        return f"Lớp {s}"
    if not s.lower().startswith("lớp") and not s.lower().startswith("khối"):
        return f"Lớp {s}"
    return s


def omml_to_latex(element: ET.Element) -> str:
    """Recursively converts an OMML Element into standard LaTeX math."""
    tag = element.tag.split("}")[-1] if "}" in element.tag else element.tag

    if tag == "t":
        text = element.text or ""
        text = text.replace("−", "-").replace("–", "-")
        text = text.replace("⇔", " \\Leftrightarrow ")
        text = text.replace("⇒", " \\Rightarrow ")
        text = text.replace("→", " \\rightarrow ")
        text = text.replace("≤", " \\le ").replace("≥", " \\ge ")
        text = text.replace("≠", " \\ne ").replace("±", " \\pm ")
        text = text.replace("×", " \\times ").replace("·", " \\cdot ")
        text = text.replace("∈", " \\in ").replace("∉", " \\notin ")
        text = text.replace("⊂", " \\subset ").replace("⊃", " \\supset ")
        text = text.replace("∪", " \\cup ").replace("∩", " \\cap ")
        text = text.replace("∅", " \\emptyset ").replace("∞", " \\infty ")
        text = text.replace("π", " \\pi ").replace("θ", " \\theta ")
        text = text.replace("α", " \\alpha ").replace("β", " \\beta ")
        text = text.replace("Δ", " \\Delta ").replace("Ω", " \\Omega ")
        return text

    elif tag == "r":
        return "".join(omml_to_latex(child) for child in element)

    elif tag == "f":
        num_el = element.find("m:num", OMML_NS)
        den_el = element.find("m:den", OMML_NS)
        num_tex = omml_to_latex(num_el).strip() if num_el is not None else ""
        den_tex = omml_to_latex(den_el).strip() if den_el is not None else ""
        return f"\\frac{{{num_tex}}}{{{den_tex}}}"

    elif tag == "sSub":
        base_el = element.find("m:e", OMML_NS)
        sub_el = element.find("m:sub", OMML_NS)
        base_tex = omml_to_latex(base_el).strip() if base_el is not None else ""
        sub_tex = omml_to_latex(sub_el).strip() if sub_el is not None else ""
        return f"{{{base_tex}}}_{{{sub_tex}}}"

    elif tag == "sSup":
        base_el = element.find("m:e", OMML_NS)
        sup_el = element.find("m:sup", OMML_NS)
        base_tex = omml_to_latex(base_el).strip() if base_el is not None else ""
        sup_tex = omml_to_latex(sup_el).strip() if sup_el is not None else ""
        return f"{{{base_tex}}}^{{{sup_tex}}}"

    elif tag == "sSubSup":
        base_el = element.find("m:e", OMML_NS)
        sub_el = element.find("m:sub", OMML_NS)
        sup_el = element.find("m:sup", OMML_NS)
        b_tex = omml_to_latex(base_el).strip() if base_el is not None else ""
        sub_tex = omml_to_latex(sub_el).strip() if sub_el is not None else ""
        sup_tex = omml_to_latex(sup_el).strip() if sup_el is not None else ""
        return f"{{{b_tex}}}_{{{sub_tex}}}^{{{sup_tex}}}"

    elif tag == "rad":
        deg_el = element.find("m:deg", OMML_NS)
        base_el = element.find("m:e", OMML_NS)
        base_tex = omml_to_latex(base_el).strip() if base_el is not None else ""
        if deg_el is not None:
            deg_tex = omml_to_latex(deg_el).strip()
            if deg_tex:
                return f"\\sqrt[{deg_tex}]{{{base_tex}}}"
        return f"\\sqrt{{{base_tex}}}"

    elif tag == "d":
        dpr = element.find("m:dPr", OMML_NS)
        beg_chr = "("
        end_chr = ")"
        if dpr is not None:
            beg_el = dpr.find("m:begChr", OMML_NS)
            end_el = dpr.find("m:endChr", OMML_NS)
            if beg_el is not None:
                beg_chr = beg_el.attrib.get(f"{{{OMML_NS['m']}}}val", beg_el.attrib.get("val", "("))
            if end_el is not None:
                end_chr = end_el.attrib.get(f"{{{OMML_NS['m']}}}val", end_el.attrib.get("val", ")"))

        m_el = element.find(".//m:m", OMML_NS)
        if beg_chr == "{" and (not end_chr or end_chr == "") and m_el is not None:
            rows = []
            for mr in m_el.findall("m:mr", OMML_NS):
                cells = [omml_to_latex(me).strip() for me in mr.findall("m:e", OMML_NS) if omml_to_latex(me).strip()]
                rows.append(" & ".join(cells))
            return "\\begin{cases} " + " \\\\ ".join(rows) + " \\end{cases}"

        e_el = element.find("m:e", OMML_NS)
        inner_tex = omml_to_latex(e_el).strip() if e_el is not None else ""

        if beg_chr == "(" and end_chr == ")":
            return f"\\left( {inner_tex} \\right)"
        elif beg_chr == "[" and end_chr == "]":
            return f"\\left[ {inner_tex} \\right]"
        elif beg_chr == "{" and end_chr == "}":
            return f"\\left\\{{ {inner_tex} \\right\\}}"
        elif beg_chr == "|" and end_chr == "|":
            return f"\\left| {inner_tex} \\right|"
        else:
            return f"{beg_chr}{inner_tex}{end_chr}"

    elif tag == "acc":
        acc_pr = element.find("m:accPr", OMML_NS)
        chr_val = "→"
        if acc_pr is not None:
            chr_el = acc_pr.find("m:chr", OMML_NS)
            if chr_el is not None:
                chr_val = chr_el.attrib.get(f"{{{OMML_NS['m']}}}val", chr_el.attrib.get("val", "→"))
        base_el = element.find("m:e", OMML_NS)
        base_tex = omml_to_latex(base_el).strip() if base_el is not None else ""
        if chr_val in ("→", "⃗"):
            return f"\\vec{{{base_tex}}}"
        elif chr_val in ("¯", "-"):
            return f"\\overline{{{base_tex}}}"
        elif chr_val in ("^", "̂"):
            return f"\\hat{{{base_tex}}}"
        return f"\\vec{{{base_tex}}}"

    elif tag == "bar":
        base_el = element.find("m:e", OMML_NS)
        base_tex = omml_to_latex(base_el).strip() if base_el is not None else ""
        return f"\\overline{{{base_tex}}}"

    elif tag in ("oMath", "oMathPara"):
        tex = "".join(omml_to_latex(child) for child in element).strip()
        tex = re.sub(r"\s+", " ", tex)
        return f"${tex}$"

    else:
        return "".join(omml_to_latex(child) for child in element)


def convert_p_to_text_and_images(p_xml: str, rels_map: Dict[str, str], exam_id: str) -> Tuple[str, str]:
    """Parse paragraph XML, converting OMML to LaTeX and image references to <img> HTML."""
    wrapped = f"<root {DOCX_NAMESPACES}>{p_xml}</root>"
    try:
        root = ET.fromstring(wrapped)[0]
    except Exception:
        return "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p_xml)).strip(), ""

    parts = []
    underlined_text = []

    def walk_runs(element):
        for child in element:
            tag = child.tag.split("}")[-1]
            if tag in ("oMath", "oMathPara"):
                parts.append(omml_to_latex(child).strip())
            elif tag == "r":
                rPr = child.find("w:rPr", OMML_NS)
                is_u = False
                if rPr is not None:
                    u_el = rPr.find("w:u", OMML_NS)
                    if u_el is not None and u_el.attrib.get(f"{{{OMML_NS['w']}}}val", u_el.attrib.get("val")) != "none":
                        is_u = True

                for sub in child:
                    sub_tag = sub.tag.split("}")[-1]
                    if sub_tag == "t":
                        t_val = sub.text or ""
                        parts.append(t_val)
                        if is_u:
                            underlined_text.append(t_val)
                    elif sub_tag in ("oMath", "oMathPara"):
                        parts.append(omml_to_latex(sub).strip())
                    elif sub_tag == "pict":
                        img_data = sub.find(".//v:imagedata", OMML_NS)
                        if img_data is not None and rels_map and exam_id:
                            rid = img_data.attrib.get(f"{{{OMML_NS['r']}}}id", img_data.attrib.get("r:id"))
                            if rid and rid in rels_map:
                                img_file = rels_map[rid]
                                if not img_file.endswith(".wmf"):
                                    parts.append(f'<br><img src="./data/images/{exam_id}/{img_file}" class="my-3 max-w-full rounded-lg shadow-sm" alt="Hình vẽ" /><br>')
                    elif sub_tag == "drawing":
                        blip = sub.find(".//a:blip", OMML_NS)
                        if blip is not None and rels_map and exam_id:
                            rid = blip.attrib.get(f"{{{OMML_NS['r']}}}embed", blip.attrib.get("r:embed"))
                            if rid and rid in rels_map:
                                img_file = rels_map[rid]
                                if not img_file.endswith(".wmf"):
                                    parts.append(f'<br><img src="./data/images/{exam_id}/{img_file}" class="my-3 max-w-full rounded-lg shadow-sm" alt="Hình vẽ" /><br>')
            else:
                walk_runs(child)

    walk_runs(root)
    full_p_text = "".join(parts).strip()
    return full_p_text, "".join(underlined_text).strip()


def extract_media_from_zip(z: zipfile.ZipFile, exam_id: str, images_dir: str = "data/images") -> Dict[str, str]:
    """Extract raster images from docx zip into data/images/{exam_id}/."""
    rels_map = {}
    try:
        rels_xml = z.read("word/_rels/document.xml.rels").decode("utf-8")
        for m in re.finditer(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels_xml):
            rid, tgt = m.group(1), m.group(2)
            if "media/" in tgt:
                rels_map[rid] = tgt.replace("media/", "")
    except Exception:
        pass

    target_dir = os.path.join(images_dir, exam_id)
    os.makedirs(target_dir, exist_ok=True)

    for f in z.namelist():
        if f.startswith("word/media/") and (f.endswith(".png") or f.endswith(".jpeg") or f.endswith(".jpg")):
            fname = os.path.basename(f)
            out_p = os.path.join(target_dir, fname)
            with open(out_p, "wb") as out_f:
                out_f.write(z.read(f))

    return rels_map


def parse_docx_bytes_to_eduvault(
    docx_bytes: bytes,
    exam_id: str,
    metadata_override: Optional[Dict[str, Any]] = None,
    images_dir: str = "data/images"
) -> Optional[Dict[str, Any]]:
    """Parse complete docx binary with OMML to LaTeX, images, and True/False marking."""
    bio = io.BytesIO(docx_bytes)
    with zipfile.ZipFile(bio, "r") as z:
        doc_xml = z.read("word/document.xml").decode("utf-8")
        rels_map = extract_media_from_zip(z, exam_id, images_dir=images_dir)

    p_xmls = re.findall(r"<w:p[ >].*?</w:p>", doc_xml, re.DOTALL)

    # Step 1: Extract Header Metadata
    title = ""
    subject = ""
    grade = "Lớp 12"

    for p_xml in p_xmls[:8]:
        raw_t = "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p_xml)).strip()
        lines = [line.strip() for line in raw_t.split("\n") if line.strip()]
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

    # Step 2: Parse Questions, Options, Explanations, Images, True/False
    questions = []
    current_q = None
    mode = None
    current_passage = ""

    for p_xml in p_xmls:
        text, u_text = convert_p_to_text_and_images(p_xml, rels_map, exam_id)
        if not text:
            continue

        # Check question start (including Bloom's taxonomy tags [TH], [NB], [VD], [VDC])
        m_q = re.match(r"^Câu\s+(\d+)(?:\s*\[[^\]]+\])?[\.:\s]+(.*)", text, re.DOTALL | re.IGNORECASE)
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
                "explanation": "",
                "type": None,
                "items": []
            }
            mode = "QUESTION"
            continue

        if not current_q:
            if ("Read the following" in text or "Đọc đoạn văn" in text or "Đọc thông tin" in text) and not text.startswith("BÀI LUYỆN TẬP") and not text.startswith("Họ, tên:"):
                current_passage = text
            continue

        # Check explanation start
        if re.match(r"^(Hướng dẫn giải|Lời giải|Giải thích)[:\s]*", text, re.IGNORECASE):
            mode = "EXPLANATION"
            exp_text = re.sub(r"^(Hướng dẫn giải|Lời giải|Giải thích)[:\s]*", "", text, flags=re.IGNORECASE).strip()
            if exp_text:
                current_q["explanation"] = exp_text
            continue

        if mode == "EXPLANATION":
            if current_q["explanation"]:
                current_q["explanation"] += "\n" + text
            else:
                current_q["explanation"] = text
            continue

        # Check True/False GDPT 2018 items: a) ... b) ... c) ... d) ...
        m_tf = re.match(r"^\s*([a-d])\)\s*(.*)", text, re.IGNORECASE)
        if m_tf:
            mode = "OPTIONS"
            current_q["type"] = "true_false"
            label = m_tf.group(1).lower()
            item_raw = m_tf.group(2).strip()

            is_correct = False
            if re.search(r"[\.\s\(\[]+T[\)\.\s\]]*$", item_raw, re.IGNORECASE) or "( T )" in item_raw:
                is_correct = True
            elif re.search(r"[\.\s\(\[]+F[\)\.\s\]]*$", item_raw, re.IGNORECASE) or "( F )" in item_raw:
                is_correct = False
            else:
                if u_text and label in u_text.lower():
                    is_correct = True

            clean_item_text = re.sub(r"[\.\s\(\[]+[TFtf][\)\.\s\]]*$", "", item_raw).strip()
            clean_item_text = re.sub(r"\s*[\(\[]\s*[TFtf]\s*[\)\]]", "", clean_item_text).strip()

            current_q["items"].append({
                "label": label,
                "text": clean_item_text,
                "correct": is_correct
            })
            continue

        # Check multiple choice options: A. ... B. ...
        has_mc = bool(re.search(r"(?:^|\s+)([A-D]\.)\s+", text))
        if has_mc:
            mode = "OPTIONS"
            parts = re.split(r"(?=(?:^|\s+)[A-D]\.\s+)", text)
            for part in parts:
                clean_part = part.strip()
                if not clean_part:
                    continue
                if re.match(r"^[A-D]\.\s+", clean_part):
                    current_q["options"].append(clean_part)

            if u_text:
                m_u = re.search(r"([A-D])\.", u_text)
                if m_u:
                    let = m_u.group(1).upper()
                    current_q["correct"] = ord(let) - ord("A")
            continue

        # Check numerical answer: Trả lời: [value]
        m_ans = re.match(r"^(?:Trả lời|Đáp số|Đáp án)[:\s]*(\[[^\]]+\]|[^\n]+)", text, re.IGNORECASE)
        if m_ans:
            ans_val = m_ans.group(1).strip()
            current_q["type"] = "short_answer"
            current_q["options"] = [f"A. {ans_val}"]
            current_q["correct"] = 0
            current_q["correctAnswer"] = ans_val
            if not current_q["explanation"]:
                current_q["explanation"] = f"Đáp án chính xác: {ans_val}"
            continue

        if mode == "QUESTION":
            current_q["question"] += "\n" + text

    if current_q:
        questions.append(current_q)

    # Post-process True/False questions: Cross-check explanation for accurate truth values
    for q in questions:
        if q.get("type") == "true_false" and q.get("items"):
            exp = q.get("explanation", "")
            for it in q["items"]:
                lbl = it["label"]
                m_exp_t = re.search(rf"\b{lbl}\)\s*Đúng", exp, re.IGNORECASE)
                m_exp_f = re.search(rf"\b{lbl}\)\s*Sai", exp, re.IGNORECASE)
                if m_exp_t and not m_exp_f:
                    it["correct"] = True
                elif m_exp_f and not m_exp_t:
                    it["correct"] = False

    if not questions:
        return None

    meta = metadata_override or {}
    final_title = title if title else (meta.get("title") or f"Bài tập OLM #{exam_id}")
    final_subject = subject if subject else (normalize_subject(meta.get("subject")) or "Tiếng Anh")
    final_grade = normalize_grade(meta.get("grade") or grade)
    duration = max(15, min(90, round(len(questions) * 1.5 / 5) * 5))

    return {
        "id": exam_id,
        "lessonId": str(meta.get("lessonId") or exam_id.split("-")[-1]),
        "title": f"OLM: {final_title}" if not final_title.upper().startswith("OLM") else final_title,
        "subject": final_subject,
        "grade": final_grade,
        "durationMinutes": duration,
        "difficulty": "Luyện tập OLM",
        "source": "OLM",
        "teacher": meta.get("teacher"),
        "deadline": meta.get("deadline"),
        "tags": [
            "OLM",
            final_subject,
            final_grade,
            "Trắc nghiệm OLM"
        ],
        "description": f"Bài tập trực tuyến OLM: {final_title}. Môn {final_subject} - {final_grade}. Tổng số {len(questions)} câu hỏi có đáp án và lời giải chi tiết.",
        "questions": questions
    }


def parse_cookie_string(raw: str) -> Dict[str, str]:
    cookies = {}
    raw = raw.strip()
    if not raw:
        return cookies

    if raw.startswith("{") and raw.endswith("}"):
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                return {str(k): str(v) for k, v in parsed.items()}
        except Exception:
            pass

    if "=" in raw:
        for part in raw.split(";"):
            part = part.strip()
            if "=" in part:
                k, v = part.split("=", 1)
                cookies[k.strip()] = v.strip()
    else:
        cookies["olm_session"] = raw
        cookies["PHPSESSID"] = raw

    return cookies


def get_authenticated_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
        "Referer": "https://olm.vn/lop-hoc-cua-toi",
    })

    cookie_val = os.environ.get("OLM_COOKIES") or os.environ.get("OLM_SESSION") or ""
    cookies = parse_cookie_string(cookie_val)
    for k, v in cookies.items():
        session.cookies.set(k, v, domain=".olm.vn")
        session.cookies.set(k, v, domain="olm.vn")

    return session


def download_word_docx(session: requests.Session, lesson_id: str) -> Optional[bytes]:
    endpoint = f"https://olm.vn/download-word-for-user?id_cate={lesson_id}&showAns=1&questionNotApproved=0"
    try:
        resp = session.get(endpoint, timeout=35, allow_redirects=True)
    except Exception as e:
        print(f"[!] Error requesting export for ID {lesson_id}: {e}")
        return None

    if resp.status_code != 200:
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


def fetch_assigned_lessons_from_olm(session: requests.Session) -> List[Dict[str, Any]]:
    url = "https://olm.vn/lop-hoc-cua-toi"
    print(f"[*] Fetching assigned lessons from {url}...")
    try:
        resp = session.get(url, timeout=25, allow_redirects=True)
    except Exception as e:
        print(f"[!] Error connecting to OLM: {e}")
        return []

    if "/dangnhap" in resp.url or resp.status_code != 200:
        print("[!] Warning: Could not authenticate to OLM. Session cookie may be expired.")
        return []

    html = resp.text
    lessons = []
    seen_ids = set()

    link_regex = re.compile(
        r'/(?:chu-de|bai-tap|hoc-lieu|luyen-tap|de-thi|kiem-tra|lam-bai|bai-hoc)/([a-zA-Z0-9_-]+?)-(\d{4,12})(?:[/?#"\'\s]|$)',
        re.IGNORECASE
    )
    for match in link_regex.finditer(html):
        slug_part = match.group(1).replace("-", " ").strip()
        lesson_id = match.group(2).strip()
        if lesson_id not in seen_ids:
            seen_ids.add(lesson_id)
            lessons.append({
                "lessonId": lesson_id,
                "title": slug_part.title(),
                "subject": "",
                "teacher": None,
                "deadline": None
            })

    param_regex = re.compile(
        r'[?&](?:id_cate|cate_id|id_hoclieu|id_hoc_lieu|id_bai|id_de|lesson_id|exam_id)=(\d{4,12})',
        re.IGNORECASE
    )
    for match in param_regex.finditer(html):
        lesson_id = match.group(1).strip()
        if lesson_id not in seen_ids:
            seen_ids.add(lesson_id)
            lessons.append({
                "lessonId": lesson_id,
                "title": f"Bài tập #{lesson_id}",
                "subject": "",
                "teacher": None,
                "deadline": None
            })

    print(f"[+] Found {len(lessons)} assigned lesson/exam candidate(s) on OLM.")
    return lessons


def load_existing_exams(json_path: str) -> List[Dict[str, Any]]:
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
    merged = list(existing_exams)
    added_count = 0
    updated_count = 0

    for new_ex in new_exams:
        new_ex["grade"] = normalize_grade(new_ex.get("grade"))
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
            merged[matched_idx] = new_ex
            updated_count += 1
        else:
            merged.append(new_ex)
            added_count += 1

    return merged, added_count, updated_count


def run_sync_pipeline(
    exams_json_path: str = "data/exams.json",
    docx_dir: Optional[str] = None,
    single_lesson_id: Optional[str] = None,
    dry_run: bool = False
) -> bool:
    print("=" * 65)
    print("  EduVault OLM Synchronizer V2 - MathML/LaTeX + Image Extractor")
    print("=" * 65)

    images_dir = os.path.join(os.path.dirname(exams_json_path), "images")

    if docx_dir and os.path.exists(docx_dir):
        print(f"[*] Scanning local docx directory: {docx_dir}")
        parsed_exams = []
        for filename in sorted(os.listdir(docx_dir)):
            if filename.endswith(".docx") and not filename.startswith("~$"):
                full_path = os.path.join(docx_dir, filename)
                m_id = re.search(r"(\d{5,12})", filename)
                lid = m_id.group(1) if m_id else str(abs(hash(filename)))[:8]
                slug = slugify(filename.replace(".docx", ""))
                exam_id = f"olm-{slug}-{lid}"
                with open(full_path, "rb") as f:
                    data = f.read()
                exam = parse_docx_bytes_to_eduvault(data, exam_id, images_dir=images_dir)
                if exam and exam.get("questions"):
                    print(f"[+] Parsed '{filename}': {len(exam['questions'])} questions -> {exam['title']}")
                    parsed_exams.append(exam)

        if parsed_exams:
            existing = load_existing_exams(exams_json_path)
            merged, added, updated = merge_new_exams(existing, parsed_exams)
            print(f"[+] Merge summary: {added} added, {updated} updated. Total: {len(merged)}")
            if not dry_run:
                save_exams(exams_json_path, merged)
                print(f"[✓] Saved updated exams to {exams_json_path}")
            return True

    session = get_authenticated_session()
    new_exams = []

    if single_lesson_id:
        print(f"[*] Processing single OLM lesson ID: {single_lesson_id}")
        docx_bytes = download_word_docx(session, single_lesson_id)
        if docx_bytes:
            exam_id = f"olm-{single_lesson_id}"
            exam = parse_docx_bytes_to_eduvault(docx_bytes, exam_id, images_dir=images_dir)
            if exam:
                new_exams.append(exam)
    else:
        lessons = fetch_assigned_lessons_from_olm(session)
        for item in lessons:
            lid = item["lessonId"]
            print(f"[*] Downloading docx for ID {lid}...")
            docx_bytes = download_word_docx(session, lid)
            if not docx_bytes:
                continue
            slug = slugify(item.get("title") or "bai-tap")
            exam_id = f"olm-{slug}-{lid}"
            exam = parse_docx_bytes_to_eduvault(docx_bytes, exam_id, metadata_override=item, images_dir=images_dir)
            if exam and exam.get("questions"):
                new_exams.append(exam)

    if new_exams:
        existing = load_existing_exams(exams_json_path)
        merged, added, updated = merge_new_exams(existing, new_exams)
        print(f"[+] Sync Complete: {added} new exams added, {updated} updated. Total: {len(merged)}")
        if not dry_run:
            return save_exams(exams_json_path, merged)

    return True


def main():
    parser = argparse.ArgumentParser(description="Sync OLM assigned exams to EduVault repository.")
    parser.add_argument("--exams-json", default="data/exams.json", help="Path to data/exams.json")
    parser.add_argument("--docx-dir", default=None, help="Sync directly from a directory of .docx files")
    parser.add_argument("--single-id", default=None, help="Sync a single OLM lesson ID directly")
    parser.add_argument("--cookie", default=None, help="Override OLM cookie string")
    parser.add_argument("--dry-run", action="store_true", help="Preview without saving to disk")

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
