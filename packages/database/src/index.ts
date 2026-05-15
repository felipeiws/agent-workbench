import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type {
  ProjectRecord,
  TerminalChunkRecord,
  TerminalSessionRecord,
  Workspace
} from "../../types/src/index";

function now(): string {
  return new Date().toISOString();
}

function mapWorkspace(row: Record<string, unknown>): Workspace {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapProject(row: Record<string, unknown>): ProjectRecord {
  return {
    id: String(row.id),
    workspaceId: String(row.workspace_id),
    name: String(row.name),
    path: String(row.path),
    safeMode: row.safe_mode as ProjectRecord["safeMode"],
    ideCommand: String(row.ide_command),
    configPath: String(row.config_path),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at)
  };
}

function mapTerminalSession(row: Record<string, unknown>): TerminalSessionRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    command: String(row.command),
    cwd: String(row.cwd),
    state: row.state as TerminalSessionRecord["state"],
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    exitCode: typeof row.exit_code === "number" ? row.exit_code : null
  };
}

function mapTerminalChunk(row: Record<string, unknown>): TerminalChunkRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    stream: row.stream as TerminalChunkRecord["stream"],
    content: String(row.content),
    createdAt: String(row.created_at)
  };
}

export interface CreateProjectInput {
  workspaceId: string;
  name: string;
  path: string;
  safeMode: ProjectRecord["safeMode"];
  ideCommand: string;
  configPath: string;
}

export interface CreateTerminalSessionInput {
  projectId: string;
  name: string;
  command: string;
  cwd: string;
  state: TerminalSessionRecord["state"];
}

export class DatabaseClient {
  private readonly db: Database.Database;

  constructor(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.db = new Database(filePath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        safe_mode TEXT NOT NULL,
        ide_command TEXT NOT NULL,
        config_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS terminal_sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        command TEXT NOT NULL,
        cwd TEXT NOT NULL,
        state TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        exit_code INTEGER
      );

      CREATE TABLE IF NOT EXISTS terminal_chunks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES terminal_sessions(id) ON DELETE CASCADE,
        stream TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON terminal_sessions(project_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_session_id ON terminal_chunks(session_id);
    `);
  }

  close(): void {
    this.db.close();
  }

  listWorkspaces(): Workspace[] {
    const rows = this.db.prepare("SELECT * FROM workspaces ORDER BY name").all();
    return rows.map((row: unknown) => mapWorkspace(row as Record<string, unknown>));
  }

  createWorkspace(name: string): Workspace {
    const record = {
      id: randomUUID(),
      name,
      createdAt: now(),
      updatedAt: now()
    };

    this.db
      .prepare(
        "INSERT INTO workspaces (id, name, created_at, updated_at) VALUES (@id, @name, @createdAt, @updatedAt)"
      )
      .run(record);

    return {
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    };
  }

  getWorkspaceByName(name: string): Workspace | null {
    const row = this.db
      .prepare("SELECT * FROM workspaces WHERE name = ? LIMIT 1")
      .get(name) as Record<string, unknown> | undefined;

    return row ? mapWorkspace(row) : null;
  }

  listProjects(): ProjectRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM projects ORDER BY workspace_id, name")
      .all();

    return rows.map((row: unknown) => mapProject(row as Record<string, unknown>));
  }

  getProjectById(projectId: string): ProjectRecord | null {
    const row = this.db
      .prepare("SELECT * FROM projects WHERE id = ? LIMIT 1")
      .get(projectId) as Record<string, unknown> | undefined;

    return row ? mapProject(row) : null;
  }

  getProjectByPath(projectPath: string): ProjectRecord | null {
    const row = this.db
      .prepare("SELECT * FROM projects WHERE path = ? LIMIT 1")
      .get(projectPath) as Record<string, unknown> | undefined;

    return row ? mapProject(row) : null;
  }

  createProject(input: CreateProjectInput): ProjectRecord {
    const record = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      name: input.name,
      path: input.path,
      safeMode: input.safeMode,
      ideCommand: input.ideCommand,
      configPath: input.configPath,
      createdAt: now(),
      updatedAt: now()
    };

    this.db
      .prepare(
        `INSERT INTO projects
          (id, workspace_id, name, path, safe_mode, ide_command, config_path, created_at, updated_at)
        VALUES
          (@id, @workspaceId, @name, @path, @safeMode, @ideCommand, @configPath, @createdAt, @updatedAt)`
      )
      .run(record);

    return this.getProjectById(record.id)!;
  }

  listTerminalSessions(projectId?: string): TerminalSessionRecord[] {
    const rows = projectId
      ? this.db
          .prepare(
            "SELECT * FROM terminal_sessions WHERE project_id = ? ORDER BY started_at DESC"
          )
          .all(projectId)
      : this.db
          .prepare("SELECT * FROM terminal_sessions ORDER BY started_at DESC")
          .all();

    return rows.map((row: unknown) =>
      mapTerminalSession(row as Record<string, unknown>)
    );
  }

  createTerminalSession(input: CreateTerminalSessionInput): TerminalSessionRecord {
    const record = {
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name,
      command: input.command,
      cwd: input.cwd,
      state: input.state,
      startedAt: now()
    };

    this.db
      .prepare(
        `INSERT INTO terminal_sessions
          (id, project_id, name, command, cwd, state, started_at)
        VALUES
          (@id, @projectId, @name, @command, @cwd, @state, @startedAt)`
      )
      .run(record);

    return this.getTerminalSessionById(record.id)!;
  }

  getTerminalSessionById(sessionId: string): TerminalSessionRecord | null {
    const row = this.db
      .prepare("SELECT * FROM terminal_sessions WHERE id = ? LIMIT 1")
      .get(sessionId) as Record<string, unknown> | undefined;

    return row ? mapTerminalSession(row) : null;
  }

  updateTerminalSessionState(
    sessionId: string,
    state: TerminalSessionRecord["state"],
    exitCode?: number
  ): TerminalSessionRecord {
    const completedAt =
      state === "completed" || state === "failed" ? now() : null;

    this.db
      .prepare(
        `UPDATE terminal_sessions
         SET state = @state, completed_at = @completedAt, exit_code = COALESCE(@exitCode, exit_code)
         WHERE id = @sessionId`
      )
      .run({
        sessionId,
        state,
        completedAt,
        exitCode: typeof exitCode === "number" ? exitCode : null
      });

    return this.getTerminalSessionById(sessionId)!;
  }

  appendTerminalChunk(
    sessionId: string,
    stream: TerminalChunkRecord["stream"],
    content: string
  ): TerminalChunkRecord {
    const record = {
      id: randomUUID(),
      sessionId,
      stream,
      content,
      createdAt: now()
    };

    this.db
      .prepare(
        `INSERT INTO terminal_chunks
          (id, session_id, stream, content, created_at)
        VALUES
          (@id, @sessionId, @stream, @content, @createdAt)`
      )
      .run(record);

    return record;
  }

  getTerminalChunks(sessionId: string): TerminalChunkRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM terminal_chunks WHERE session_id = ? ORDER BY created_at ASC"
      )
      .all(sessionId);

    return rows.map((row: unknown) => mapTerminalChunk(row as Record<string, unknown>));
  }
}
