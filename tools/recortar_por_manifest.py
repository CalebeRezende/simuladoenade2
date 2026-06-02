#!/usr/bin/env python3
"""
Recorta questões de um PDF a partir de um manifest JSON de coordenadas.

Uso:
  pip install pymupdf
  python tools/recortar_por_manifest.py prova.pdf manifest.json questoes/

Manifest exemplo:
[
  {"page": 1, "x": 60, "y": 120, "w": 480, "h": 520, "filename": "tipo1_q001.png", "scale": 2}
]

As coordenadas x,y,w,h são em pontos do PDF. Para uso mais simples, prefira cropper.html.
"""
import json, sys, pathlib, fitz

if len(sys.argv) != 4:
    print("Uso: python recortar_por_manifest.py prova.pdf manifest.json saida/")
    sys.exit(1)

pdf_path = sys.argv[1]
manifest_path = sys.argv[2]
out_dir = pathlib.Path(sys.argv[3])
out_dir.mkdir(parents=True, exist_ok=True)

doc = fitz.open(pdf_path)
items = json.load(open(manifest_path, encoding="utf-8"))

for item in items:
    page = doc[item["page"] - 1]
    rect = fitz.Rect(item["x"], item["y"], item["x"] + item["w"], item["y"] + item["h"])
    scale = item.get("scale", 2)
    pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=rect, alpha=False)
    out = out_dir / item["filename"]
    pix.save(out)
    print("salvo:", out)
