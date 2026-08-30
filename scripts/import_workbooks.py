#!/usr/bin/env python3
"""Dependency-free, deterministic importer for the committed OOXML sources."""
from zipfile import ZipFile
from xml.etree import ElementTree as ET
from pathlib import Path
import json,re,unicodedata
M='{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'; R='{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'
ROOT=Path(__file__).resolve().parents[1]
def column(ref):
 n=0
 for c in re.match('[A-Z]+',ref).group(): n=n*26+ord(c)-64
 return n-1
def sheet_rows(path,sheet):
 z=ZipFile(path); shared=[]
 if 'xl/sharedStrings.xml' in z.namelist():
  for x in ET.fromstring(z.read('xl/sharedStrings.xml')): shared.append(''.join(t.text or '' for t in x.iter(M+'t')))
 wb=ET.fromstring(z.read('xl/workbook.xml')); rel=ET.fromstring(z.read('xl/_rels/workbook.xml.rels')); targets={x.attrib['Id']:x.attrib['Target'] for x in rel}
 target=next(targets[s.attrib[R+'id']] for s in wb.find(M+'sheets') if s.attrib['name']==sheet)
 result=[]
 for row in ET.fromstring(z.read('xl/'+target)).iter(M+'row'):
  values={}
  for cell in row.findall(M+'c'):
   v=cell.find(M+'v'); value=None
   if cell.attrib.get('t')=='s' and v is not None:value=shared[int(v.text)]
   elif cell.attrib.get('t')=='inlineStr':value=''.join(t.text or '' for t in cell.iter(M+'t'))
   elif v is not None:value=v.text
   values[column(cell.attrib['r'])]=value
  if values: result.append([values.get(i) for i in range(max(values)+1)])
 return result
def records(path,sheet,header_row):
 rows=sheet_rows(path,sheet); heads=rows[header_row-1]
 return [{h:(r[i] if i<len(r) else None) for i,h in enumerate(heads) if h} for r in rows[header_row:] if r and r[0]]
def num(v):
 try:return float(v)
 except:return None
q=records(ROOT/'Quotazioni_Fantacalcio_Stagione_2026_27.xlsx','Tutti',2)
s={r['Id']:r for r in records(ROOT/'Statistiche_Fantacalcio_Stagione_2026_27.xlsx','Tutti',2)}
cups={r[1]:r[0] for r in sheet_rows(ROOT/'Stat_Figures_2025.xlsx','Coppe')[1:] if len(r)>1 and r[1]}
inj={r[0]:r for r in sheet_rows(ROOT/'Stat_Figures_2025.xlsx','Infortuni (GPT)')[1:] if r and r[0]!='n/a'}
pc={r[0]:r for r in sheet_rows(ROOT/'Stat_Figures_2025.xlsx','Pro_Contro')[1:] if r and r[0]}
priority=['POR','DC','E','C','WA','PC']
def category(rm):
 roles={x.strip().lower() for x in (rm or '').split(';')}; x=[]
 for cat,ok in [('POR','por' in roles),('DC','dc' in roles),('E','e' in roles),('C',bool(roles&{'c','m'})),('WA',bool(roles&{'w','a','t'})),('PC','pc' in roles)]:
  if ok:x.append(cat)
 return x[-1] if x else None
players=[]
for r in q:
 st=s.get(r['Id'],{}); i=inj.get(r['Id']); prose=pc.get(r['Id'])
 auction=num(r.get('FVM M')) or num(r.get('FVM')) or 0; quote=num(r.get('Qt.A M')) or num(r.get('Qt.A')) or 0
 players.append({'id':r['Id'],'name':r['Nome'],'team':r['Squadra'],'roles':r['RM'],'rankingCategory':category(r['RM']),'auctionValue':auction,'quotation':quote,'hypeFactor':round(auction/quote,2) if quote else None,'cups':cups.get(r['Squadra'],''),'age':None,'avgPg':None,'avgMf':None,'actPg':num(st.get('Pv')),'actMf':num(st.get('Fm')),'status':'OK' if not i else f'Infortunato · Rientro: {i[3]}','pro':prose[5] if prose and len(prose)>5 else None,'contro':prose[6] if prose and len(prose)>6 else None})
(ROOT/'data/players.json').write_text(json.dumps(players,ensure_ascii=False,separators=(',',':')))
print(f'Imported {len(players)} players; {sum(p["rankingCategory"] is None for p in players)} without dedicated category')
