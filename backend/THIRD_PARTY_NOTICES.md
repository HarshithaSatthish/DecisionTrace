# Third-Party Notices & Attribution

DecisionTrace incorporates design patterns, interfaces, and architecture adapted from the following open-source projects.

---

### 1. Full Stack FastAPI Template
- **Upstream Source**: https://github.com/fastapi/full-stack-fastapi-template
- **License**: MIT License
- **Copyright**: (c) 2019 Sebastián Ramírez
- **Usage**: Backend structure, FastAPI application lifecycle, SQLModel session management, Alembic migrations configuration, Pydantic settings, Docker container patterns. Bundled React frontend and built-in password auth were removed in favor of Clerk JWT verification.

```text
The MIT License (MIT)

Copyright (c) 2019 Sebastián Ramírez

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

---

### 2. Omi (BasedHardware)
- **Upstream Source**: https://github.com/BasedHardware/omi
- **Documentation**: https://docs.omi.me/doc/developer/apps/Integrations
- **License**: MIT License / Apache 2.0
- **Usage**: Webhook payload structure specifications (`transcript_segments`, `id`, `created_at`, `structured` metadata) and verification workflows.

---

### 3. BAAI / bge-small-en-v1.5
- **Upstream Source**: https://huggingface.co/BAAI/bge-small-en-v1.5
- **License**: MIT License
- **Usage**: Pretrained 384-dimensional text embeddings for local FastEmbed CPU vector memory extraction.

---

### 4. Qdrant Client & FastEmbed
- **Upstream Source**: https://github.com/qdrant/qdrant-client and https://github.com/qdrant/fastembed
- **License**: Apache License 2.0
- **Usage**: Vector database client, payload filtering by `user_id`, FastEmbed text embedding integration.

---

### 5. RQ (Redis Queue)
- **Upstream Source**: https://github.com/rq/rq
- **License**: BSD 2-Clause License
- **Usage**: Background job queuing and execution with JSON serialization.
