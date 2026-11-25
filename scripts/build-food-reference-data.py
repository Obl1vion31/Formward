#!/usr/bin/env python3
"""从保留的成分及份量原表生成逐项核对后的公共目录。"""
import argparse
import csv
import io
import json
import re
from collections import defaultdict
from decimal import Decimal, InvalidOperation
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile

FNDDS = {
    "dataset": "USDA FNDDS 2021–2023",
    "url": "https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/"
           "beltsville-human-nutrition-research-center/food-surveys-research-group/docs/"
           "fndds-download-databases/",
}
TFDA = {
    "dataset": "台湾食药署食品营养成分资料集 · 2026-10-05",
    "url": "https://data.gov.tw/dataset/8543",
}
METRICS = ("caloriesKcal", "proteinG", "carbsG", "fatG")
TFDA_METRICS = dict(zip(("熱量", "粗蛋白", "總碳水化合物", "粗脂肪"), METRICS))
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
CATALOG = Path(__file__).resolve().parents[1] / "src/features/meals"


def spreadsheet(path):
    with ZipFile(path) as book:
        strings = []
        if "xl/sharedStrings.xml" in book.namelist():
            table = ElementTree.fromstring(book.read("xl/sharedStrings.xml"))
            strings = ["".join(node.itertext()) for node in table.findall("s:si", NS)]
        sheet = ElementTree.fromstring(book.read("xl/worksheets/sheet1.xml"))
        rows = sheet.findall("s:sheetData/s:row", NS)
        for row in rows[1:]:
            cells = {}
            for cell in row:
                column = re.sub(r"[0-9]+", "", cell.attrib["r"])
                value = cell.findtext("s:v", "", NS)
                if cell.get("t") == "s" and value:
                    value = strings[int(value)]
                elif cell.get("t") == "inlineStr":
                    value = "".join(cell.find("s:is", NS).itertext())
                cells[column] = value
            yield cells


def number(value):
    value = value.strip()
    if value in {"", "-", "--", "－", "Tr", "trace", "ND"}:
        return None
    try:
        parsed = Decimal(value)
    except InvalidOperation as error:
        raise ValueError(f"未识别的数量 {value!r}") from error
    if not parsed.is_finite() or parsed < 0:
        raise ValueError(f"超出可用范围的数量 {value!r}")
    return format(parsed, "f")


def fndds(source_dir):
    foods = list(spreadsheet(source_dir / "fndds-foods.xlsx"))
    nutrients = list(spreadsheet(source_dir / "fndds-nutrients.xlsx"))
    portions = list(spreadsheet(source_dir / "fndds-portions.xlsx"))
    nutrient_headers = {"E": "Energy (kcal)", "F": "Protein (g)", "G": "Carbohydrate (g)", "J": "Total Fat (g)"}
    portion_headers = {"E": "Seq num", "F": "Portion description"}
    if (foods[0]["B"] != "Main food description"
            or any(nutrients[0].get(column) != name for column, name in nutrient_headers.items())
            or any(portions[0].get(column) != name for column, name in portion_headers.items())):
        raise ValueError("FNDDS 原表列已变更，请先核对原表。")
    food_names = {row["A"]: row["B"] for row in foods[1:] if row.get("A", "").isdigit()}
    values = {
        row["A"]: [row.get(column, "") for column in ("E", "F", "G", "J")]
        for row in nutrients[1:] if row.get("A", "").isdigit()
    }
    measures = {
        (row["A"], row["E"]): (row["F"], row["G"])
        for row in portions[1:] if row.get("A", "").isdigit()
    }
    return food_names, values, measures


def tfda(source_dir):
    with ZipFile(source_dir / "tfda.zip") as archive:
        table = archive.read("20_2.csv").decode("utf-8-sig")
    names = {}
    values = defaultdict(dict)
    for row in csv.DictReader(io.StringIO(table)):
        code = row["整合編號"]
        names[code] = row["樣品名稱"]
        metric = TFDA_METRICS.get(row["分析項"])
        if metric is None:
            continue
        unit = row["含量單位"].strip()
        expected_unit = "kcal" if metric == "caloriesKcal" else "g"
        if unit != expected_unit:
            raise ValueError(f"{code} {metric} 的单位 {unit} 与预期不符。")
        current = row["每100克含量"]
        if metric in values[code] and values[code][metric] != current:
            raise ValueError(f"{code} {metric} 的原始读数重复。")
        values[code][metric] = current
    return names, values


def build(source_dir):
    usda_names, usda_values, usda_measures = fndds(source_dir)
    tfda_names, tfda_values = tfda(source_dir)
    data = []
    used_ids = set()
    used_sources = set()
    with (CATALOG / "reference-selection.psv").open(encoding="utf-8") as selection:
        for row in csv.DictReader(selection, delimiter="|"):
            identity = row["id"]
            reference, code = row["source"].split(":")
            version = int(row["version"])
            if version < 1:
                raise ValueError(f"{identity} 的规格版本须为正整数。")
            if identity in used_ids or row["source"] in used_sources:
                raise ValueError(f"{identity} 或其来源 {row['source']} 重复。")
            used_ids.add(identity)
            used_sources.add(row["source"])
            checked_portions = []
            if reference == "usda":
                source = {**FNDDS, "recordId": code, "title": usda_names[code]}
                metrics = dict(zip(METRICS, map(number, usda_values[code])))
                if row["portion"]:
                    seq, unit, label = row["portion"].split(":", 2)
                    title, weight = usda_measures[(code, seq)]
                    grams = number(weight)
                    if not title.startswith("1 ") or grams is None or Decimal(grams) <= 0:
                        raise ValueError(f"{identity} 的份量证据必须是有效的 1 个计量单位。")
                    checked_portions.append({
                        "id": "fndds-" + seq, "unit": unit, "edibleGrams": grams, "label": label,
                        "source": {**source, "recordId": code + " · " + seq, "title": title},
                    })
            elif reference == "tfda":
                source = {**TFDA, "recordId": code, "title": tfda_names[code]}
                metrics = {metric: number(tfda_values[code].get(metric, "")) for metric in METRICS}
                if row["portion"]:
                    raise ValueError(f"{identity} 仍缺少可独立核对的食用单位。")
            else:
                raise ValueError(f"未知来源 {reference}")
            if all(value is None for value in metrics.values()):
                raise ValueError(f"{identity} 无可用营养数据。")
            data.append({
                "id": identity, "version": version, "family": row["family"], "name": row["name"],
                "aliases": row["aliases"].split(";"), "state": row["state"], "method": row["method"],
                **({"skin": row["skin"]} if row["skin"].strip() else {}),
                "preparation": row["preparation"], "illustration": row["illustration"],
                "source": source, "nutrition": metrics, "portions": checked_portions,
            })
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_dir", type=Path)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    rows = build(args.source_dir)
    output = CATALOG / "reference-expansion.json"
    content = json.dumps(rows, ensure_ascii=False, indent=2) + "\n"
    if args.check:
        if output.read_text(encoding="utf-8") != content:
            raise SystemExit("生成结果与当前目录不一致。")
    else:
        output.write_text(content, encoding="utf-8")
    print(f"{len(rows)} 个经过核对的追加规格")


if __name__ == "__main__":
    main()
