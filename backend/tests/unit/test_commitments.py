from datetime import timedelta

from sqlmodel import select

from app.db.models import AuditEvent, Task, utc_now


def test_owned_task_status_and_overdue_are_persisted_and_audited(client, db_session, test_user):
    task = Task(
        user_id=test_user.id, title="Migration", due_date=utc_now() - timedelta(days=1), updated_at=utc_now() - timedelta(days=8)
    )
    db_session.add(task)
    db_session.commit()
    headers = {"Authorization": f"Bearer {test_user.clerk_id}"}
    listed = client.get("/api/v1/commitments", headers=headers).json()["items"]
    assert listed[0]["overdue"] is True
    assert listed[0]["needsFollowUp"] is True
    assert (
        client.patch(
            f"/api/v1/commitments/{task.id}", json={"status": "completed"}, headers={"Authorization": "Bearer user_other"}
        ).status_code
        == 404
    )
    changed = client.patch(f"/api/v1/commitments/{task.id}", json={"status": "completed"}, headers=headers)
    assert changed.status_code == 200
    assert changed.json()["overdue"] is False
    assert changed.json()["needsFollowUp"] is False
    assert client.patch(f"/api/v1/commitments/{task.id}", json={"status": "completed"}, headers=headers).status_code == 200
    assert len(db_session.exec(select(AuditEvent)).all()) == 1
    db_session.refresh(task)
    assert task.status == "completed"
