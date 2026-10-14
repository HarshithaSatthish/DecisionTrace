"""Run migrations and concurrent approvals in a disposable PostgreSQL schema."""

import os
import subprocess
import sys
import uuid

from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.schema import CreateSchema, DropSchema

url = make_url(os.environ["POSTGRES_TEST_URL"]).set(drivername="postgresql+psycopg")
engine = create_engine(url, connect_args={"connect_timeout": 5})
schema = f"decisiontrace_check_{uuid.uuid4().hex}"
test_url = url.update_query_dict({"options": f"-csearch_path={schema}"}).render_as_string(hide_password=False)
test_env = {**os.environ, "POSTGRES_TEST_URL": test_url, "DATABASE_URL": test_url, "APP_ENV": "test"}

with engine.begin() as connection:
    connection.execute(CreateSchema(schema))
try:
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], env=test_env, check=True)
    subprocess.run(
        [
            sys.executable,
            "-m",
            "pytest",
            "tests/unit/test_approvals_and_audit.py::test_concurrent_approvals_with_real_postgresql",
            "-q",
        ],
        env=test_env,
        check=True,
    )
    print("PostgreSQL migrations and concurrent approvals verified in isolated schema.")
finally:
    with engine.begin() as connection:
        connection.execute(DropSchema(schema, cascade=True))
    engine.dispose()
