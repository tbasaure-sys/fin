from meta_alpha_allocator.signal_intelligence.audit import audit_source, build_quarantine_manifest


def test_audit_source_records_hash_license_and_risky_constructs_without_source_text():
    source = """//@version=6\n// SPDX-License-Identifier: MPL-2.0\nindicator('Synthetic')\nrequest.security(syminfo.tickerid, 'D', close, lookahead=barmerge.lookahead_on)\nalertcondition(true, 'x', 'y')\n"""

    record = audit_source(source, ordinal=7)

    assert record["ordinal"] == 7
    assert record["pineVersion"] == 6
    assert record["license"] == "MPL-2.0"
    assert "request.security" in record["riskFlags"]
    assert "lookahead_on" in record["riskFlags"]
    assert "alerts" in record["riskFlags"]
    assert "source" not in record


def test_quarantine_manifest_is_aggregate_only_and_deterministic():
    files = [("first.txt", "//@version=6\nindicator('a')"), ("second.txt", "//@version=6\nindicator('b')")]

    manifest = build_quarantine_manifest(files)

    assert manifest["schemaVersion"] == "tradingview-quarantine.v1"
    assert manifest["count"] == 2
    assert [item["ordinal"] for item in manifest["items"]] == [1, 2]
    assert all("name" not in item and "source" not in item for item in manifest["items"])
    assert manifest["summary"]["pineVersions"] == {"6": 2}
