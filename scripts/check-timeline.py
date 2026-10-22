"""Run from repository root: python3 scripts/check-timeline.py [src/data/timeline.json].
Requires the exporter's pandas/numpy/scipy dependencies. No private corpus needed.
"""
import importlib.util
import json
from pathlib import Path
import sys

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('export_timeline', ROOT/'tools/export_timeline.py')
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


def close(a, b):
    assert abs(a-b) < 1e-12, (a, b)


def fixtures():
    triangle = m.metrics(['1', '2', '3'], [('1-2', 1), ('1-3', 1), ('2-3', 1)])
    for key in ('R', 'Q', 'E'):
        close(triangle[key], 1)
    age9 = m.metrics(['1', '2'], [('1-2', 2.8)])
    close(age9['E'], 1/2.8)
    isolated = m.metrics(['1', '2', '3'], [('1-2', 1)])
    close(isolated['R'], 1/3); close(isolated['Q'], 1); close(isolated['E'], 1/3)
    assert isolated['isolates'] == 1
    disconnected = m.metrics(['1', '2'], [])
    assert disconnected['E'] == disconnected['R'] == 0 and disconnected['Q'] is None
    assert m.metrics([], []) is None and m.metrics(['1'], []) is None
    alternate = m.metrics(['1', '2', '3'], [('1-2', 1), ('2-3', 1), ('1-3', 2.8)])
    close(alternate['E'], (1+1+.5)/3)
    # Refresh only on cooperative observations; other kinds supply roster nodes.
    weeks = [{'observations': []} for _ in range(11)]
    weeks[0]['observations'] = [['1-2', 'cooperative', 1]]
    weeks[5]['observations'] = [['1-2', 'antagonistic', 2], ['2-3', 'other', 1]]
    ns, es = m.snapshot(weeks, 9)
    assert ns == ['1', '2', '3'] and es == [('1-2', 2.8)]
    assert m.snapshot(weeks, 10) == (['1', '2', '3'], [])
    weeks[8]['observations'] = [['1-2', 'cooperative', 1]]
    assert m.snapshot(weeks, 9)[1] == [('1-2', 1.2)]
    return ['fresh triangle', 'age-nine pair', 'isolated roster node', 'no reachable pairs',
            'n below two', 'fresh two-hop path beats aged direct edge',
            'all-kinds roster and cooperative-only refresh', 'expiry and newest cooperative observation']


def dense_metrics(nodes, edges):
    # Independent NumPy Floyd–Warshall implementation (not scipy shortest_path).
    n = len(nodes)
    positions = {node: i for i, node in enumerate(nodes)}
    dist = np.full((n, n), np.inf)
    np.fill_diagonal(dist, 0)
    degrees = np.zeros(n, dtype=int)
    for edge_id, value in edges:
        i, j = (positions[v] for v in edge_id.split('-'))
        dist[i, j] = dist[j, i] = value
        degrees[i] += 1; degrees[j] += 1
    for k in range(n):
        dist = np.minimum(dist, dist[:, k, None] + dist[None, k, :])
    upper = dist[np.triu_indices(n, 1)]
    finite = upper[np.isfinite(upper)]
    reachable, possible = len(finite), n*(n-1)//2
    total = float((1/finite).sum())
    return {'n': n, 'possible': possible, 'reachable': reachable, 'R': reachable/possible,
            'Q': total/reachable if reachable else None, 'E': total/possible,
            'isolates': int((degrees == 0).sum())}


def main():
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT/'src/data/timeline.json'
    data = json.loads(path.read_text())
    net = json.loads((ROOT/'src/data/network.json').read_text())
    edges = {e['id']: e for e in net['edges']}
    nodes = {n['id']: n for n in net['nodes']}
    assert data['meta']['observationsSha256'] == m.canonical_hash([w['observations'] for w in data['weeks']])
    for index, week in enumerate(data['weeks']):
        if index < 9:
            assert week['metrics'] is None
        assert week['observations'] == sorted(week['observations'], key=lambda x: (m.edge_key(x[0]), x[1]))
        for edge_id, kind, count in week['observations']:
            assert edge_id in edges and kind in (*m.KINDS, 'other') and isinstance(count, int) and count > 0
            a, b = (nodes[v] for v in edge_id.split('-'))
            assert a['scope'] in m.SCOPES and b['scope'] in m.SCOPES
            excluded = lambda n: n['scope'].lower() in {'federal', 'state'} and n['type'].strip().lower() in m.EXCLUDED_TYPES
            assert not (excluded(a) and excluded(b))
        if week['metrics'] is not None:
            q = week['metrics']['Q']
            close(week['metrics']['E'], week['metrics']['R']*q if q is not None else 0)
    results = []
    for index in sorted({9, len(data['weeks'])//2, len(data['weeks'])-1}):
        roster, cooperative = m.snapshot(data['weeks'], index)
        dense = dense_metrics(roster, cooperative)
        sparse = m.metrics(roster, cooperative)
        saved = data['weeks'][index]['metrics']
        for key in dense:
            if dense[key] is None:
                assert sparse[key] is None and saved[key] is None
            else:
                close(dense[key], sparse[key]); close(dense[key], saved[key])
        results.append({'date': data['weeks'][index]['date'], 'metrics': dense,
                        'sparseDenseMaxError': max(abs(dense[k]-sparse[k]) for k in dense if dense[k] is not None)})
    report = {'status': 'passed', 'fixtures': fixtures(), 'realWeekDenseComparisons': results,
              'weeksChecked': len(data['weeks']), 'timelineSha256': m.sha(path),
              'privacySchema': 'Weekly edge IDs, interaction categories, counts and aggregate metrics only; no article IDs or text.'}
    print(json.dumps(report, indent=2), flush=True)


if __name__ == '__main__':
    main()
