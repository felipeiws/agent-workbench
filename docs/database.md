# Database

## Engine

- SQLite
- Driver: `better-sqlite3`

## Arquivo

- Local padrão: `app.getPath("userData")/agent-workbench.db`

## Schema

### `workspaces`

- `id TEXT PRIMARY KEY`
- `name TEXT NOT NULL UNIQUE`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### `projects`

- `id TEXT PRIMARY KEY`
- `workspace_id TEXT NOT NULL`
- `name TEXT NOT NULL`
- `path TEXT NOT NULL UNIQUE`
- `safe_mode TEXT NOT NULL`
- `ide_command TEXT NOT NULL`
- `config_path TEXT NOT NULL`
- `created_at TEXT NOT NULL`
- `updated_at TEXT NOT NULL`

### `terminal_sessions`

- `id TEXT PRIMARY KEY`
- `project_id TEXT NOT NULL`
- `name TEXT NOT NULL`
- `command TEXT NOT NULL`
- `cwd TEXT NOT NULL`
- `state TEXT NOT NULL`
- `started_at TEXT NOT NULL`
- `completed_at TEXT`
- `exit_code INTEGER`

### `terminal_chunks`

- `id TEXT PRIMARY KEY`
- `session_id TEXT NOT NULL`
- `stream TEXT NOT NULL`
- `content TEXT NOT NULL`
- `created_at TEXT NOT NULL`

## Persistência do MVP

- Workspaces
- Projetos adicionados
- Sessões de terminal
- Output persistido por chunks
- Exit code e timestamps

## Extensões previstas

- snapshots Git
- marcações de suspicion
- eventos operacionais
- preferências de layout
