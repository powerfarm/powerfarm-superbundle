from __future__ import annotations

import copy

from continuum_maf import make_memory_projection, render_memory_projection


def test_maf_memory_projection_is_explicitly_non_authoritative():
    wake = {
        "observations": [{"class": "OBSERVED", "evidence_ref": "pf.evidence.1"}],
        "claims": [{"class": "INFERRED", "based_on": ["pf.evidence.1"]}],
        "uncertainties": [{"class": "UNKNOWN", "subject": "delivery"}],
        "next_sample": "2026-08-31T08:00:00+01:00",
    }
    original = copy.deepcopy(wake)
    projection = make_memory_projection(wake)
    assert projection["source"] == "powerfarm-memory"
    assert projection["authoritative"] is False
    assert projection["content_sha256"].startswith("sha256:")
    assert wake == original
    rendered = render_memory_projection(projection)
    assert "read-only and non-authoritative" in rendered
    assert "OBSERVED" in rendered


def test_engine_local_mutation_does_not_write_back_to_powerfarm_memory():
    wake = {"uncertainties": [{"class": "UNKNOWN", "subject": "customs"}]}
    projection = make_memory_projection(wake)
    projection["payload"]["uncertainties"].clear()
    assert wake["uncertainties"] == [{"class": "UNKNOWN", "subject": "customs"}]
