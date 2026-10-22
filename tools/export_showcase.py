"""Research-side export only. Requires pandas + openpyxl; never bundles raw inputs.
Run: python tools/export_showcase.py --source SOURCE.dta --edges EDGES.csv
     --actors ACTORS.xlsx --output src/data/showcase.json
All input paths are explicit. Only the output path is written.
"""
import argparse
import hashlib
import json
from collections import Counter
from pathlib import Path
import pandas as pd


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def export(source, edges, actors, output):
    d = pd.read_stata(source, convert_categoricals=False)
    csv = pd.read_csv(edges, dtype={"uid1": str, "uid2": str})
    required = ["article_id", "relationship_index", "groupA_uid", "groupB_uid", "groupA", "groupB", "groupA_canonical_name", "groupB_canonical_name", "text_AtoB", "relationship_AtoB", "interaction_type", "title", "date", "publication"]
    assert set(required).issubset(d.columns), list(d.columns)
    assert not d[["groupA_uid", "groupB_uid"]].isna().any().any(), "Missing UIDs"
    def uid(value):
        return str(int(value))
    def pair(a, b):
        return tuple(sorted((uid(a), uid(b)), key=int))
    def edge_id(a, b):
        return "-".join(pair(a, b))
    counted = Counter()
    for row in d.itertuples():
        if row.groupA_uid != row.groupB_uid and row.interaction_type in ("cooperative", "antagonistic", "neutral"):
            counted[(*pair(row.groupA_uid, row.groupB_uid), row.interaction_type)] += 1
    expected = Counter()
    for row in csv.itertuples():
        for kind, col in [("cooperative", "cooperation_count"), ("antagonistic", "antagonistic_count"), ("neutral", "neutral_count")]:
            if int(getattr(row, col)):
                expected[(*pair(row.uid1, row.uid2), kind)] += int(getattr(row, col))
    assert counted == expected, "Source aggregation does not match edge CSV"
    print(f"Reconciled {sum(counted.values())} counted records across {len(csv)} exported pairs", flush=True)
    workbook = pd.read_excel(actors)
    print("Actor workbook columns:", list(workbook.columns), flush=True)
    cols = {str(c).lower().strip(): c for c in workbook.columns}
    id_col = next((cols[k] for k in ("uid", "actor_uid", "id") if k in cols), None)
    assert id_col is not None, "Cannot identify workbook UID column"
    assert "actor_scope" in cols and "actor_type" in cols, "Missing explicit actor classifications"
    classification = {uid(r[id_col]): r for _, r in workbook.iterrows() if pd.notna(r[id_col])}
    labels = {}
    all_edges = {}
    for r in csv.itertuples():
        a, b = pair(r.uid1, r.uid2)
        labels[uid(r.uid1)] = r.uid1_name
        labels[uid(r.uid2)] = r.uid2_name
        all_edges[edge_id(a, b)] = {"id": edge_id(a, b), "a": a, "b": b, "counts": {"cooperative": int(r.cooperation_count), "antagonistic": int(r.antagonistic_count), "neutral": int(r.neutral_count)}}
    # Editorial selections are explicit, not a degree filter.
    definitions = [
        {"id": "food-support", "title": "The network behind food support", "kicker": "01 / COMMUNITY INFRASTRUCTURE", "description": "A foundation, a fundraising campaign and food-relief organisations appear together in reporting about support for Geelong people. Cafes and a bakery widen this picture of local participation.", "takeaway": "Food support brings charities, local businesses and relief organisations into a shared local effort.", "pairs": [(2073,2080),(2080,2727),(2073,2771)], "context": [(2082,2928),(2073,2928),(2080,3271),(2080,3277)], "steps": [
            {"title": "Start with one reported connection", "text": "Give Where You Live and Feed Geelong are linked in the stored reporting. Select the line to read an example.", "pairs": [(2073,2080)]},
            {"title": "Follow the food-relief network", "text": "Feed Geelong's campaign reporting describes support for the city's emergency food relief agencies. The wider context includes the Food Relief Centre and Community Foundation.", "pairs": [(2080,2727)]},
            {"title": "Organisations join a campaign", "text": "Give Where You Live and FareShare appear together in the launch of the annual Feed Geelong campaign. Select their relationship to read the report.", "pairs": [(2073,2080),(2073,2771)]}]},
        {"id": "education-workers", "title": "Education, government and workers", "kicker": "02 / INSTITUTIONAL CONNECTIONS", "description": "The Gordon connects government, another education institution and groups of workers in reporting about skills and career transitions. Context adds the Geelong Tech School and a worker-transition project.", "takeaway": "Education institutions connect public investment with people preparing for changing work.", "pairs": [(1004,3067),(2644,3067),(3067,3699)], "context": [(2123,3067),(3066,3067),(2796,3067)], "steps": [
            {"title": "An education–government connection", "text": "A May 2015 passage describes government working with The Gordon on apprenticeship programs for train and tram engineers.", "pairs": [(1004,3067)]},
            {"title": "Institutions meet worker groups", "text": "The reporting describes a longstanding Gordon–Deakin partnership and career advice for retrenched workers through the Workforce Development Centre, mapped to The Gordon in this network.", "pairs": [(2644,3067),(3067,3699)]},
            {"title": "Career pathways in a changing economy", "text": "The Gordon worked with Alcoa workers to plan future career pathways. The surrounding context also connects it with the Geelong Tech School and the Ford Transition Project.", "pairs": [(2123,3067)]}]},
        {"id": "grow-partnership", "title": "Partnerships around GROW", "kicker": "03 / CROSS-ORGANISATIONAL TIES", "description": "Follow a small selection around GROW, Give Where You Live and G21. The reporting describes a joint initiative across organisational boundaries.", "takeaway": "Local organisations, public institutions and business commitments come together around a shared jobs initiative.", "pairs": [(2073,2074),(2073,2821),(2074,2821)], "context": [(1004,2821),(2072,2821),(2070,2821)], "steps": [
            {"title": "A joint initiative", "text": "An August 2015 excerpt describes GROW as a joint initiative of Give Where You Live and G21. Read the words behind their connection.", "pairs": [(2073,2074)]},
            {"title": "The program in the network", "text": "GROW appears as a distinct actor alongside its partners. The records describe a partnership and a funding pledge around a shared jobs initiative.", "pairs": [(2073,2821),(2074,2821)]},
            {"title": "A wider circle of participation", "text": "A 2016 report describes a council-funded employment project with GROW and neighbourhood centres. The wider context also records compact signatories committing to invest in local businesses and people.", "pairs": [(2072,2821)]}]},
        {"id": "national-local", "title": "National support, local places", "kicker": "04 / NATIONAL TO LOCAL", "description": "Reporting about a Norlane redevelopment links Australian Government support, Baptcare and the Norlane community. Nearby selected ties show other federal commitments to local support programs.", "takeaway": "National institutions become part of a local network through specific commitments to organisations and places.", "pairs": [(1001,2296),(1001,2005),(2005,2296)], "context": [(1001,2426),(1001,2750)], "steps": [
            {"title": "A national commitment to a local site", "text": "A May 2015 report says Baptcare bought the former Norlane Primary School site and won $7.25 million in Commonwealth support. The Australian Government and Baptcare occupy different scope bands.", "pairs": [(1001,2296)]},
            {"title": "The community named in the report", "text": "An April 2016 report describes Australian Government investment in accessible social infrastructure for Norlane. The extraction represents Norlane residents with the Norlane community node.", "pairs": [(1001,2005)]},
            {"title": "Local organisations and community places", "text": "The same 2016 report identifies Baptcare and the Australian Government as funders of the planned project. Separate commitments to Bridgelink and Eunike widen the picture of national support for local services.", "pairs": [(2005,2296),(1001,2296)]}]},
        {"id": "flood-support", "title": "Helping people after the flood", "kicker": "05 / COMMUNITY RESPONSE", "description": "Reports after Geelong's 27 January 2016 flood describe crews working together, residents seeking assistance and practical support for people facing immediate needs.", "takeaway": "Cooperation becomes tangible in rescue requests, clean-up work and help with the costs of recovery.", "pairs": [(2072,3866),(2001,3866),(2072,2926)], "context": [(1004,2926),(2001,2072)], "steps": [
            {"title": "Crews work together", "text": "On 29 January, the reporting describes eight council crews helping the SES divert traffic and clear debris from council roads.", "pairs": [(2072,3866)]},
            {"title": "Residents seek help", "text": "A 30 January report records more than 350 requests for SES assistance in the Geelong area and 15 rescue calls during the wild weather and flash floods. The source's Geelong residents are mapped to the community node.", "pairs": [(2001,3866)]},
            {"title": "Practical help with recovery", "text": "A 4 February report says residents would not pay tip fees under an assistance program. Its selected context also records state grants for immediate needs such as food, water and shelter.", "pairs": [(2072,2926)]}]}
    ]
    # Keep only existing positive-count pairs. Missing editorial targets fail rather than silently disappear.
    selected = set()
    for story in definitions:
        for a,b in story["pairs"] + story["context"]:
            key = edge_id(a,b)
            assert key in all_edges and sum(all_edges[key]["counts"].values()) > 0, f"Missing curated pair {key}"
            selected.add(key)
    selected_edges = []
    # Every preview excerpt is pinned for reproducibility, not implicitly chosen by date.
    preferred = {
        "1004-2821": ("1675010661",4), "1004-3067": ("1677668618",3),
        "2072-2821": ("1824648512",3), "2073-2074": ("1704408552",1),
        "2073-2080": ("1721945066",2), "2073-2771": ("1718807195",4),
        "2073-2821": ("1646860439",5), "2073-2928": ("1722717086",2),
        "2074-2821": ("1646860439",2), "2080-2727": ("1718807360",1),
        "2082-2928": ("1797805887",3), "2123-3067": ("1675047556",1),
        "2644-3067": ("1675047556",2), "3067-3699": ("1658944102",2),
        "1001-2296": ("1680835413",1), "1001-2005": ("1783019063",1),
        "2005-2296": ("1783019063",3), "1001-2426": ("1672366124",2),
        "1001-2750": ("1672366124",1), "2072-3866": ("1760932161",4),
        "2001-3866": ("1761320902",4), "2072-2926": ("1762175746",1),
        "1004-2926": ("1762175746",4), "2001-2072": ("1761320902",2),
        "2080-3271": ("1718120609",1), "2080-3277": ("1718120609",3),
        "3066-3067": ("1841894985",2), "2796-3067": ("1826318315",3),
        "2070-2821": ("1735784305",1)
    }
    context_notes = {
        "2080-3271": "The sentence calls the donor 'the cafe'; the stored extraction identifies King of the Castle cafe from the article context.",
        "2070-2821": "The source actor is the GROW compact signatories, grouped with the GROW program in the network. The passage describes a commitment to invest, rather than completed investment.",
        "2796-3067": "The report describes the Ford Transition Project and Gordon TAFE support. Its case-management figure refers to the project as a whole, not an outcome attributed to The Gordon alone.",
        "2005-2296": "The sentence identifies the project funders but does not name Norlane residents. That endpoint is supplied by the stored extraction and surrounding project context. The completion date is a reported plan. Bridgelink and Eunike are separate projects in the selected story context.",
        "1001-2005": "The passage names Norlane and the Australian Government; the extraction represents the place's residents as the Norlane community actor. It reports an investment, not a measured community outcome.",

        "2001-3866": "The source actor Geelong residents is normalised to the broader Geelong community node. The excerpt reports requests and rescue calls, not a count of completed rescues.",
        "2072-2926": "The passage says residents and council spokeswoman; the extraction supplies the City of Greater Geelong and Geelong flood victims endpoints from the article context.",
        "2072-3866": "The source names council crews; these are mapped to the broader City of Greater Geelong Council, Mayor and Staff node. SES is the State Emergency Service node.",
        "1004-2821": "This sentence mentions State Government funding, but does not name GROW. The GROW endpoint comes from the stored extraction; this sentence alone does not establish that pair. Original article context has not been verified.",
        "2073-2821": "The pledge sentence names Give Where You Live, but does not identify its recipient. GROW is supplied by the stored extraction, not established by this sentence alone. Original article context has not been verified.",
        "2073-2928": "This sentence names Give Where You Live but refers only to 'the campaign', not the Geelong Food Relief Centre. The Centre endpoint comes from the stored extraction; this sentence alone does not establish that pair. Original article context has not been verified.",
        "2080-2727": "The sentence mentions organisers and food-relief agencies, but does not name Feed Geelong. That endpoint comes from the stored extraction, not this sentence alone. Original article context has not been verified.",
        "2082-2928": "The beneficiary is named, but the Geelong Community Foundation is not named in this sentence. The Foundation endpoint comes from the stored extraction; this sentence alone does not establish that pair. Original article context has not been verified.",
        "3067-3699": "The passage refers to 'WDC'; the stored actor name expands this as Geelong Workforce Development Centre and maps it to The Gordon. The excerpt does not itself establish that institutional equivalence."
    }
    assert selected == set(preferred), "Each selected pair needs an explicit featured record"
    for key in sorted(selected, key=lambda k: tuple(map(int,k.split("-")))):
        edge = dict(all_edges[key])
        mask = d.apply(lambda r: edge_id(r.groupA_uid,r.groupB_uid) == key, axis=1)
        rows = d[mask & d.interaction_type.isin(["cooperative","antagonistic","neutral"])].copy()
        rows = rows.sort_values(["date","article_id","relationship_index"], kind="stable")
        records = []
        for _, r in rows.iterrows():
            if not str(r.text_AtoB).strip() or not str(r.title).strip():
                continue
            aid = str(r.article_id).removesuffix(".0")
            idx = int(r.relationship_index)
            record = {"id": f"{aid}:{idx}", "articleId": aid, "relationshipIndex": idx, "title": str(r.title), "date": pd.Timestamp(r.date).strftime("%Y-%m-%d"), "publication": str(r.publication), "sourceA": str(r.groupA), "sourceB": str(r.groupB), "canonicalA": str(r.groupA_canonical_name), "canonicalB": str(r.groupB_canonical_name), "uidA": uid(r.groupA_uid), "uidB": uid(r.groupB_uid), "interaction": str(r.interaction_type), "excerpt": str(r.text_AtoB), "relationship": str(r.relationship_AtoB)}
            records.append(record)
        prefer = preferred[key]
        chosen = [r for r in records if (r["articleId"],r["relationshipIndex"]) == prefer]
        assert len(chosen) == 1, f"Featured record missing or ambiguous {key}"
        if key in context_notes:
            chosen[0]["contextNote"] = context_notes[key]
            print(f"WARNING context-dependent excerpt {key}: {context_notes[key]}",flush=True)
        # Matching literal names is a diagnostic, not substantive verification of aliases.
        excerpt_lower = chosen[0]["excerpt"].lower()
        if not all(chosen[0][field].lower() in excerpt_lower for field in ("sourceA","sourceB")):
            print(f"WARNING {key}: source actor names are not both literal matches in the snippet; check aliases/context before publication",flush=True)
        # One explicitly selected preview excerpt per pair. Additional records stay private.
        edge["evidence"] = chosen
        assert edge["evidence"], f"No excerpt for {key}"
        selected_edges.append(edge)
    node_ids = {v for e in selected_edges for v in (e["a"],e["b"])}
    selected_nodes = []
    for node_id in sorted(node_ids,key=int):
        assert node_id in classification, f"No classification for UID {node_id}"
        r = classification[node_id]
        scope = str(r[cols["actor_scope"]]).strip().title()
        # Workbook may use scope phrases: only explicit accepted values are allowed.
        scope = {"Federal/National": "Federal", "National": "Federal"}.get(scope,scope)
        assert scope in ("Federal","State","Local","Community"), (node_id,scope)
        selected_nodes.append({"id": node_id,"label": labels[node_id],"scope":scope,"type":str(r[cols["actor_type"]])})
    stories = []
    for definition in definitions:
        story = {k:v for k,v in definition.items() if k not in ("pairs","context","steps")}
        story["edgeIds"] = [edge_id(*p) for p in definition["pairs"]]
        story["contextEdgeIds"] = [edge_id(*p) for p in definition["context"]]
        story["nodeIds"] = sorted({uid(v) for p in definition["pairs"] for v in p},key=int)
        story["steps"] = [{"title":s["title"],"text":s["text"],"edgeIds":[edge_id(*p) for p in s["pairs"]]} for s in definition["steps"]]
        stories.append(story)
    data = {"meta":{"source":"draft_submission_docs/network_geelong_UID/geelong_localise_UIDs.dta","sourceSha256":sha(source),"csvSha256":sha(edges),"actorClassificationSha256":sha(actors),"summary":{"actors":len(labels),"pairs":len(csv),"countedTies":sum(counted.values()),"articles":int(d.article_id.nunique()),"sourceRows":len(d)},"notice":"Research preview. Selected excerpts are stored extraction records, not independently checked transcriptions of original articles. Counts reproduce the source edge export. Article publication rights and canonical-name mappings require confirmation before public release. This exhibit is not the thesis rolling Social Cohesion Network Index."},"nodes":selected_nodes,"edges":selected_edges,"stories":stories}
    output = Path(output)
    output.parent.mkdir(parents=True,exist_ok=True)
    output.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Exported {len(selected_nodes)} actors, {len(selected_edges)} pairs and {len(stories)} stories to {output}",flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ("source","edges","actors","output"):
        parser.add_argument("--"+name,required=True)
    args = parser.parse_args()
    export(args.source,args.edges,args.actors,args.output)
