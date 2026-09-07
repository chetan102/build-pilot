# BuildPilot Performance Profiling & Multi-Worker Scaling Guide

## 1. Concurrency & Resource Consumption (Task 22.1)
- **Worktree Isolation**: Each task run allocates an ephemeral Git worktree mounted into a container, preventing concurrent lock contention on `.git/index`.
- **CPU & Memory Budget**: Recommended worker allocation: `2 vCPUs, 4GB RAM` per 3 concurrent tasks.
- **Docker Sandbox Limits**: Default container limits enforce `cpus: 1.0`, `memory: 1024m` per task execution.

## 2. Worker Clustering & High Availability (Task 22.2)
- **Shared BullMQ Queue**: Multiple worker replicas connect to the same Redis `engineering-task` queue.
- **Job Lease & Heartbeat Renewal**: Workers acquire an atomic Redis lock and renew leases every 15s (`HeartbeatManager`). If a worker drops out, `CrashRecoveryService` re-enqueues stalled tasks automatically.
- **Zero-Downtime Worker Restarts**: Workers drain active jobs up to `drainTimeoutMs: 30000` on `SIGTERM`.

## 3. Bottleneck Analysis & Optimization (Task 22.3)
1. **LLM Provider Latency**: Use model token streaming to minimize time-to-first-token. Cache read-only repository context.
2. **Docker Container Warmup**: Pre-pull base runner images (`node:20-alpine`, `python:3.11-slim`) on worker nodes.
3. **MongoDB Indexing**: Compound indexes on `{ taskId: 1, createdAt: -1 }` and `{ status: 1 }` ensure sub-millisecond query execution during high load.
