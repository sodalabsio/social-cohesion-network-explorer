"""Export public weekly pair counts and ten-week SCNI; never publish article text/IDs.
Requires pandas, numpy and scipy. Example:
python3 tools/export_timeline.py --source /research/geelong_localise_UIDs.dta \
  --network src/data/network.json --showcase src/data/showcase.json \
  --output src/data/timeline.json
The result reconstructs the showcase population with the regional weighted formula;
it is not the published regional series. Actor scope/type come from network.json,
whose workbook hash is checked against the pinned showcase metadata.
"""
import argparse
from collections import Counter
import hashlib
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.sparse import csr_matrix
from scipy.sparse.csgraph import dijkstra

WINDOW = 10
DECAY = 0.2
KINDS = ('cooperative', 'antagonistic', 'neutral')
SCOPES = {'Federal', 'State', 'Local', 'Community'}
EXCLUDED_TYPES = {'government', 'police, legal and emergency services'}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def canonical_hash(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                     ensure_ascii=False).encode()).hexdigest()


def edge_key(value):
    return tuple(map(int, value.split('-')))


def snapshot(weeks, index):
    """All observation kinds supply nodes; newest cooperative week supplies length."""
    nodes, newest = set(), {}
    for j in range(max(0, index-WINDOW+1), index+1):
        for edge_id, kind, count in weeks[j]['observations']:
            a, b = edge_id.split('-')
            nodes.update((a, b))
            if kind == 'cooperative':
                newest[edge_id] = index-j
    return sorted(nodes, key=int), [(e, 1+DECAY*age) for e, age in
                                   sorted(newest.items(), key=lambda x: edge_key(x[0]))]


def metrics(nodes, edges):
    """Undirected efficiency E, reachability R and conditional proximity Q."""
    n = len(nodes)
    if n < 2:
        return None
    positions = {node: i for i, node in enumerate(nodes)}
    rows, cols, values = [], [], []
    for edge_id, distance in edges:
        a, b = (positions[v] for v in edge_id.split('-'))
        rows.extend((a, b)); cols.extend((b, a)); values.extend((distance, distance))
    graph = csr_matrix((values, (rows, cols)), shape=(n, n), dtype=float)
    distances = dijkstra(graph, directed=False)
    upper = distances[np.triu_indices(n, 1)]
    finite = upper[np.isfinite(upper)]
    possible = n*(n-1)//2
    reachable = len(finite)
    inverse_sum = float(np.sum(1/finite))
    return {'n': n, 'possible': possible, 'reachable': reachable,
            'R': reachable/possible,
            'Q': inverse_sum/reachable if reachable else None,
            'E': inverse_sum/possible,
            'isolates': int(np.count_nonzero(np.diff(graph.indptr) == 0))}


def export(source, network, showcase, output):
    net = json.loads(Path(network).read_text())
    curated = json.loads(Path(showcase).read_text())
    source_hash = sha(source)
    assert source_hash == curated['meta']['sourceSha256'], 'Unpinned source DTA'
    assert net['meta']['csvSha256'] == curated['meta']['csvSha256']
    assert net['meta']['actorClassificationSha256'] == curated['meta']['actorClassificationSha256']
    nodes = {n['id']: n for n in net['nodes']}
    edges = {e['id']: e for e in net['edges']}
    # Read only fields needed to compute public counts, not article text or IDs.
    data = pd.read_stata(source, convert_categoricals=False,
                         columns=['groupA_uid', 'groupB_uid', 'date', 'interaction_type'])
    dates = pd.to_datetime(data['date'], format='%Y-%m-%d', errors='raise')
    assert dates.notna().all() and not data[['groupA_uid', 'groupB_uid']].isna().any().any()
    mondays = dates - pd.to_timedelta(dates.dt.weekday, unit='D')
    week_dates = pd.date_range(mondays.min(), mondays.max(), freq='7D')
    weeks = [{'date': date.strftime('%Y-%m-%d'), 'observations': [], 'metrics': None}
             for date in week_dates]
    first = week_dates[0]
    raw_counts, weekly = Counter(), Counter()
    diagnostic = Counter(sourceRows=len(data))
    source_types, retained_types = Counter(), Counter()

    def excluded(node):
        return node['scope'].strip().lower() in {'federal', 'state'} and \
               node['type'].strip().lower() in EXCLUDED_TYPES

    for row, monday in zip(data.itertuples(index=False), mondays):
        a, b = sorted((int(row.groupA_uid), int(row.groupB_uid)))
        kind = str(row.interaction_type)
        source_types[kind] += 1
        if a == b:
            diagnostic['selfRowsDropped'] += 1
            continue
        edge_id = f'{a}-{b}'
        if kind in KINDS:
            raw_counts[(edge_id, kind)] += 1
        assert edge_id in edges, f'Pair missing from public network: {edge_id}'
        na, nb = nodes[str(a)], nodes[str(b)]
        if na['scope'] not in SCOPES or nb['scope'] not in SCOPES:
            diagnostic['otherScopeRowsDropped'] += 1
            continue
        if excluded(na) and excluded(nb):
            diagnostic['governmentPairRowsDropped'] += 1
            continue
        diagnostic['retainedRows'] += 1
        retained_types[kind] += 1
        index = int((monday-first).days//7)
        weekly[(index, edge_id, kind if kind in KINDS else 'other')] += 1

    expected = Counter({(e['id'], kind): count for e in net['edges']
                        for kind, count in e['counts'].items() if count})
    assert raw_counts == expected, 'All-source recognized pair-kind counts differ from network'
    assert sum(raw_counts.values()) == net['meta']['countedTies']
    diagnostic['reconciledCountedRows'] = sum(raw_counts.values())
    diagnostic['reconciledPairs'] = len(edges)
    for (index, edge_id, kind), count in sorted(weekly.items(),
            key=lambda x: (x[0][0], edge_key(x[0][1]), x[0][2])):
        weeks[index]['observations'].append([edge_id, kind, count])
    for index in range(WINDOW-1, len(weeks)):
        roster, cooperative_edges = snapshot(weeks, index)
        weeks[index]['metrics'] = metrics(roster, cooperative_edges)
    retained_nodes = {node for week in weeks for edge_id, _, _ in week['observations']
                      for node in edge_id.split('-')}
    retained_pairs = {edge_id for week in weeks for edge_id, _, _ in week['observations']}
    diagnostic.update(retainedActors=len(retained_nodes), retainedPairs=len(retained_pairs),
                      weeks=len(weeks), fullWindows=len(weeks)-WINDOW+1)
    payload = {'meta': {
        'windowWeeks': WINDOW, 'decay': DECAY, 'floodDate': '2016-01-27',
        'sourceSha256': source_hash, 'networkCsvSha256': net['meta']['csvSha256'],
        'networkSha256': sha(network),
        'actorClassificationSha256': net['meta']['actorClassificationSha256'],
        'observationsSha256': canonical_hash([w['observations'] for w in weeks]),
        'source': curated['meta']['source'], 'firstWeek': weeks[0]['date'],
        'lastWeek': weeks[-1]['date'], 'firstFullWeek': weeks[WINDOW-1]['date'],
        'method': 'Showcase-population reconstruction using the regional weighted SCNI formula, not the published regional series. Monday bins; current and nine prior weeks. All retained interaction types supply the node roster. For each cooperative pair use its newest cooperative observation in the window, with length 1 + 0.2 * age in weeks. Undirected weighted shortest paths; E is sum of inverse finite unordered path lengths divided by n(n-1)/2; R is reachable pairs divided by possible pairs; Q is mean inverse length among reachable pairs, so E = R * Q. First nine weeks and n < 2 have null metrics; no reachable pairs gives E = R = 0 and Q = null.',
        'population': 'Four displayed scope bands: Federal, State, Local, Community. Drop self pairs and pairs where both endpoints are federal/state actors of type government or police, legal and emergency services, following SCM/main_dos/mata_setup.do. Classification is pinned to the showcase workbook. Unknown interaction types are retained as other, supplying roster nodes but not cooperative paths.',
        'diagnostics': dict(sorted(diagnostic.items())),
        'sourceInteractionCounts': dict(sorted(source_types.items())),
        'retainedInteractionCounts': dict(sorted(retained_types.items()))}, 'weeks': weeks}
    target = Path(output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':'),
                                 allow_nan=False)+'\n', encoding='utf-8')
    print(json.dumps({'output': str(target), 'sha256': sha(target),
                      'diagnostics': payload['meta']['diagnostics'],
                      'firstFullWeek': payload['meta']['firstFullWeek']}, indent=2), flush=True)
    return payload


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ('source', 'network', 'showcase', 'output'):
        parser.add_argument('--'+name, required=True)
    args = parser.parse_args()
    export(args.source, args.network, args.showcase, args.output)
