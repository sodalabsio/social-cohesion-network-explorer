"""Export public network metadata only, with a deterministic hierarchical layout.
python tools/export_network.py --edges edges.csv --actors actors.xlsx --showcase src/data/showcase.json --output src/data/network.json
Uses Python's standard library. Never reads or publishes the raw article corpus.
"""
import argparse
import csv
import hashlib
import json
import math
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

SCOPES = ['Federal', 'State', 'Local', 'Community', 'Other']
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def workbook_rows(path):
    with zipfile.ZipFile(path) as z:
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            shared = [''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si', NS)]
        rows = []
        for row in ET.fromstring(z.read('xl/worksheets/sheet1.xml')).findall('.//s:row', NS):
            values = {}
            for cell in row.findall('s:c', NS):
                column = ''.join(c for c in cell.attrib['r'] if c.isalpha())
                value = cell.find('s:v', NS)
                inline = cell.find('s:is', NS)
                text = value.text if value is not None else ''
                if cell.get('t') == 's':
                    text = shared[int(text)]
                elif cell.get('t') == 'inlineStr':
                    text = ''.join(inline.itertext()) if inline is not None else ''
                values[column] = text
            rows.append(values)
        headers = {column: str(value).strip().lower() for column, value in rows[0].items()}
        return [{headers[c]: v for c, v in row.items() if c in headers} for row in rows[1:]]


def export(edges, actors, showcase, output):
    source_hash = hashlib.sha256(Path(edges).read_bytes()).hexdigest()
    curated = json.loads(Path(showcase).read_text(encoding='utf-8'))
    assert source_hash == curated['meta']['csvSha256'], 'CSV is not the version used for the stories'
    classification = {}
    for row in workbook_rows(actors):
        raw = row.get('uid', row.get('actor_uid', row.get('id')))
        if raw:
            classification[str(int(float(raw)))] = row
    nodes, graph = {}, []
    neighbors = {}
    with open(edges, encoding='utf-8-sig', newline='') as f:
        for row in csv.DictReader(f):
            a, b = str(int(row['uid1'])), str(int(row['uid2']))
            assert int(a) < int(b), 'Expected ascending unordered pair'
            counts = dict(zip(['cooperative', 'antagonistic', 'neutral'], [int(row[c]) for c in ['cooperation_count', 'antagonistic_count', 'neutral_count']]))
            assert sum(counts.values()) == int(row['tie_count'])
            graph.append({'id': a+'-'+b, 'a': a, 'b': b, 'counts': counts})
            for uid, label in [(a, row['uid1_name']), (b, row['uid2_name'])]:
                record = classification.get(uid)
                assert record is not None, f'Missing actor classification {uid}'
                scope = str(record.get('actor_scope', '')).strip().title()
                scope = {'Federal/National': 'Federal', 'National': 'Federal'}.get(scope, scope)
                assert scope in SCOPES, f'Unknown scope {uid}: {scope}'
                nodes[uid] = {'id': uid, 'label': label, 'scope': scope, 'type': record.get('actor_type', '') or 'Unclassified'}
                neighbors.setdefault(uid, [])
            neighbors[a].append(b)
            neighbors[b].append(a)
    # Barycentric sweeps shorten links while respecting research scope bands.
    # This is a display layout, not geography, authority or a network statistic.
    rows = {s: sorted([n['id'] for n in nodes.values() if n['scope'] == s], key=int) for s in SCOPES}
    xs = {uid: (i+.5)/len(ids) for ids in rows.values() for i, uid in enumerate(ids)}
    for sweep in range(12):
        for scope in (SCOPES if sweep % 2 == 0 else list(reversed(SCOPES))):
            ids = rows[scope]
            ids.sort(key=lambda uid: (.35*xs[uid]+.65*sum(xs[v] for v in neighbors[uid])/len(neighbors[uid]), int(uid)))
            for i, uid in enumerate(ids):
                xs[uid] = (i+.5)/len(ids)
    for scope_index, scope in enumerate(SCOPES):
        ids = rows[scope]
        # Eight small subrows make low-degree actors visible without removing them.
        for i, uid in enumerate(ids):
            nodes[uid]['x'] = round(.035+.93*xs[uid], 7)
            nodes[uid]['y'] = round(scope_index/len(SCOPES)+.035+(i % 8)/7*.12, 7)
    ordered = sorted(nodes.values(), key=lambda n: int(n['id']))
    for n in curated['nodes']:
        full = nodes[n['id']]
        assert all(full[k] == n[k] for k in ['label', 'scope', 'type']), f'Curated classification mismatch {n["id"]}'
    summary = curated['meta']['summary']
    assert (len(ordered), len(graph), sum(sum(e['counts'].values()) for e in graph)) == (summary['actors'], summary['pairs'], summary['countedTies'])
    payload = {'meta': {'actors': len(ordered), 'pairs': len(graph), 'countedTies': summary['countedTies'], 'csvSha256': source_hash, 'actorClassificationSha256': hashlib.sha256(Path(actors).read_bytes()).hexdigest(), 'layout': 'Deterministic barycentric scope bands with eight display subrows. Coordinates are not geography, rank or measured importance. Scope classifications reproduce the research workbook.'}, 'nodes': ordered, 'edges': graph}
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
    print(f'Full network export: {len(ordered)} actors, {len(graph)} pairs, {summary["countedTies"]} counted ties; {target.stat().st_size} bytes', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for key in ['edges', 'actors', 'showcase', 'output']:
        parser.add_argument('--'+key, required=True)
    args = parser.parse_args()
    export(args.edges, args.actors, args.showcase, args.output)
