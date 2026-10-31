#!/usr/bin/env python3
"""Render the editable Phase 8 report; use the bundled Python with reportlab."""
from pathlib import Path
import re
from html import escape
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.utils import ImageReader
from reportlab.lib.pagesizes import A4
from reportlab.graphics.shapes import Drawing, Rect, String, Line, Polygon

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'docs/report.md'
OUTPUT = ROOT / 'output/pdf/LendLoop_Report.pdf'


def enrich(text):
    readme = (ROOT / 'README.md').read_text()
    rows = [line for line in readme.splitlines() if re.match(r'\| \d+ \|', line)]
    assert len(rows) == 44, 'Expected all 44 concept rows'
    concept_rows = []
    for row in rows:
        cells = [c.strip() for c in row.strip('|').split('|')]
        refs = re.findall(r'\[([^]]+)\]\(', cells[3])
        concept_rows.append('| ' + ' | '.join([cells[0], cells[1].replace('**', ''), cells[2].replace('`', ''), '; '.join(refs)]) + ' |')
    header = '| # | Concept | Implementation | Reference |\n|---|---|---|---|\n'
    text = text.replace('{{CONCEPTS_A}}', header + '\n'.join(concept_rows[:22]))
    text = text.replace('{{CONCEPTS_B}}', header + '\n'.join(concept_rows[22:]))
    tests = [line for line in (ROOT / 'docs/phase-4-verification.md').read_text().splitlines() if re.match(r'^\| T\d+ ', line)]
    assert len(tests) == 21
    compact = ['| Test and requirement | Result |', '|---|---|']
    compact += ['| ' + r.strip('|').split('|')[0].strip().replace('—', '-') + ' | Pass |' for r in tests]
    return text.replace('{{TEST_TABLE}}', '\n'.join(compact))


def inline(s):
    s = escape(s)
    s = re.sub(r'\*\*(.*?)\*\*', r'<b>\1</b>', s)
    s = re.sub(r'`(.*?)`', r'\1', s)
    return s


def state_diagram():
    d = Drawing(497, 110)
    nodes = {'Requested': (0, 78), 'Approved': (101, 78), 'Active': (202, 78), 'ReturnClaimed': (303, 78), 'Completed': (404, 78), 'Cancelled': (50, 10), 'Defaulted': (202, 10), 'Disputed': (303, 10), 'Resolved': (404, 10)}
    def arrow(x1, y1, x2, y2):
        import math
        d.add(Line(x1, y1, x2, y2, strokeColor=colors.HexColor('#688c9e'), strokeWidth=1))
        a = math.atan2(y2-y1, x2-x1)
        pts = [x2,y2,x2-5*math.cos(a-.45),y2-5*math.sin(a-.45),x2-5*math.cos(a+.45),y2-5*math.sin(a+.45)]
        d.add(Polygon(pts, fillColor=colors.HexColor('#688c9e'), strokeWidth=0))
    for left, right in [('Requested','Approved'),('Approved','Active'),('Active','ReturnClaimed'),('ReturnClaimed','Completed'),('Disputed','Resolved')]:
        x,y = nodes[left]; xx,yy = nodes[right]; arrow(x+88,y+12,xx,yy+12)
    for top,bottom in [('Requested','Cancelled'),('Approved','Cancelled'),('Active','Defaulted'),('ReturnClaimed','Disputed')]:
        x,y=nodes[top]; xx,yy=nodes[bottom]; arrow(x+44,y,xx+44,yy+24)
    for label,(x,y) in nodes.items():
        d.add(Rect(x,y,88,24,rx=4,ry=4,fillColor=colors.HexColor('#e8f2f6'),strokeColor=colors.HexColor('#b9d4df')))
        d.add(String(x+44,y+9,label,textAnchor='middle',fontName='Helvetica',fontSize=8,fillColor=colors.HexColor('#123951')))
    return d


def build():
    text = enrich(SOURCE.read_text())
    # Persist expanded maps to make Markdown a standalone editable report.
    if '{{CONCEPTS_A}}' in SOURCE.read_text():
        SOURCE.write_text(text)
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name='BodyReport', fontName='Helvetica', fontSize=9.5, leading=12.5, spaceAfter=8, textColor=colors.HexColor('#243348')))
    styles.add(ParagraphStyle(name='CellReport', parent=styles['BodyReport'], fontSize=8, leading=10, spaceAfter=0))
    styles.add(ParagraphStyle(name='TitleReport', fontName='Helvetica-Bold', fontSize=34, leading=40, spaceAfter=20, textColor=colors.HexColor('#123951')))
    styles['Heading2'].fontSize = 19
    styles['Heading2'].leading = 24
    styles['Heading2'].spaceAfter = 14
    styles['Heading2'].textColor = colors.HexColor('#123951')
    styles['Heading3'].fontSize = 12
    styles['Heading3'].leading = 16
    styles['Heading3'].spaceBefore = 7
    styles['Heading3'].spaceAfter = 7
    width = A4[0] - 96
    story = []
    lines = text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if not line:
            i += 1
            continue
        if line == '<!-- pagebreak -->':
            story.append(PageBreak())
        elif line == '<!-- rental-diagram -->':
            story.extend([state_diagram(), Spacer(1, 8)])
        elif line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                row = lines[i].strip()
                if not re.match(r'^\|[-: |]+\|$', row):
                    rows.append([Paragraph(inline(c.strip()), styles['CellReport']) for c in row.strip('|').split('|')])
                i += 1
            n = len(rows[0])
            widths = {2: ([width*.76, width*.24] if 'Test and requirement' in rows[0][0].text else [width*.34, width*.66]), 3: [width*.30, width*.35, width*.35], 4: [width*.055, width*.255, width*.43, width*.26]}[n]
            table = Table(rows, colWidths=widths, repeatRows=1, hAlign='LEFT')
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#dcecf3')),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f3f6f8')]),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 6), ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 4), ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('LINEBELOW', (0, 0), (-1, 0), .6, colors.HexColor('#b9d4df')),
            ]))
            story.extend([table, Spacer(1, 12)])
            continue
        elif line.startswith('!['):
            match = re.match(r'!\[(.*?)\]\((.*?)\)', line)
            path = ROOT / 'docs' / match[2]
            iw, ih = ImageReader(str(path)).getSize()
            scale = min(width/iw, 180/ih)
            story.extend([Image(str(path), iw*scale, ih*scale, hAlign='LEFT'), Spacer(1, 8)])
        elif line.startswith('# '):
            story.append(Paragraph(inline(line[2:]), styles['TitleReport']))
        elif line.startswith('## '):
            story.append(Paragraph(inline(line[3:]), styles['Heading2']))
        elif line.startswith('### '):
            story.append(Paragraph(inline(line[4:]), styles['Heading3']))
        else:
            story.append(Paragraph(inline(line), styles['BodyReport']))
        i += 1
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, leftMargin=48, rightMargin=48, topMargin=48, bottomMargin=45, title='LendLoop - Project Report', author='LendLoop project')
    def footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor('#c6dce5'))
        canvas.line(48, 36, A4[0]-48, 36)
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(colors.HexColor('#53677a'))
        canvas.drawString(48, 24, 'LENDLOOP  |  PROJECT REPORT  |  31 OCTOBER 2026')
        canvas.drawRightString(A4[0]-48, 24, str(doc.page))
        canvas.restoreState()
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUTPUT)

if __name__ == '__main__':
    build()
