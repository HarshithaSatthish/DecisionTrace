def test_omi_rejects_invalid_ids_and_oversized_transcripts(client, test_integration):
    _, token = test_integration
    endpoint = f"/api/v1/webhooks/omi/{token}"
    assert client.post(endpoint, json={"id": " ", "transcript_segments": [{"text": "Hello"}]}).status_code == 422
    assert (
        client.post(
            endpoint, json={"id": "oversized", "transcript_segments": [{"text": "x" * 30000}, {"text": "y" * 30000}]}
        ).status_code
        == 413
    )
    assert (
        client.post(endpoint, json={"id": "invalid-clock", "transcript_segments": [{"text": "Hello", "start": -1}]}).status_code
        == 422
    )
