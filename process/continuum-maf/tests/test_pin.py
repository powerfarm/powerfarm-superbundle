from continuum_maf import PINNED_MAF_REVISION_REF, PINNED_MAF_VERSION


def test_pin_is_microsoft_agent_framework_1_16_0():
    assert PINNED_MAF_VERSION == "1.16.0"
    assert PINNED_MAF_REVISION_REF == "microsoft-agent-framework==1.16.0"
