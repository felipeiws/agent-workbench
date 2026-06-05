import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";

import type BetterSqlite3 from "better-sqlite3";
import type {
  AuditEvent,
  AuditRisk,
  GitHubIssueRecord,
  ProjectRecord,
  ProjectLayoutRecord,
  TaskLoopRecord,
  TaskLoopStatus,
  TaskLoopTaskRecord,
  TaskLoopTaskStatus,
  TerminalChunkRecord,
  TerminalSessionRecord,
  Workspace
} from "../../types/src/index";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as typeof BetterSqlite3;

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

function mapProjectLayout(row: Record<string, unknown>): ProjectLayoutRecord {
  return {
    projectId: String(row.project_id),
    activeSessionId: row.active_session_id ? String(row.active_session_id) : null,
    terminalMode: row.terminal_mode as ProjectLayoutRecord["terminalMode"],
    diffMode: row.diff_mode as ProjectLayoutRecord["diffMode"],
    selectedFilePath: row.selected_file_path ? String(row.selected_file_path) : null,
    updatedAt: String(row.updated_at)
  };
}

function mapAuditEvent(row: Record<string, unknown>): AuditEvent {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    projectId: String(row.project_id),
    command: String(row.command),
    risk: row.risk as AuditRisk,
    reason: String(row.reason),
    detectedAt: String(row.detected_at)
  };
}

function mapGitHubIssueRecord(row: Record<string, unknown>): GitHubIssueRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    issueNumber: Number(row.issue_number),
    title: String(row.title),
    dispatchedAt: String(row.dispatched_at),
    sessionId: row.session_id ? String(row.session_id) : null
  };
}

function mapTaskLoop(row: Record<string, unknown>): TaskLoopRecord {
  return {
    id: String(row.id),
    projectId: String(row.project_id),
    name: String(row.name),
    agent: row.agent as TaskLoopRecord["agent"],
    status: row.status as TaskLoopStatus,
    currentTaskIndex: Number(row.current_task_index),
    totalTasks: Number(row.total_tasks),
    sessionId: row.session_id ? String(row.session_id) : null,
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null
  };
}

function mapTaskLoopTask(row: Record<string, unknown>): TaskLoopTaskRecord {
  return {
    id: String(row.id),
    loopId: String(row.loop_id),
    taskIndex: Number(row.task_index),
    title: String(row.title),
    status: row.status as TaskLoopTaskStatus,
    startedAt: row.started_at ? String(row.started_at) : null,
    completedAt: row.completed_at ? String(row.completed_at) : null
  };
}

function buildDefaultProjectLayout(projectId: string): ProjectLayoutRecord {
  return {
    projectId,
    activeSessionId: null,
    terminalMode: "focus",
    diffMode: "side-by-side",
    selectedFilePath: null,
    updatedAt: now()
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

export interface SaveProjectLayoutInput {
  projectId: string;
  activeSessionId: string | null;
  terminalMode: ProjectLayoutRecord["terminalMode"];
  diffMode: ProjectLayoutRecord["diffMode"];
  selectedFilePath: string | null;
}

export interface UpdateProjectConfigInput {
  projectId: string;
  name: string;
  safeMode: ProjectRecord["safeMode"];
  ideCommand: string;
}

export interface CreateAuditEventInput {
  sessionId: string;
  projectId: string;
  command: string;
  risk: AuditRisk;
  reason: string;
}

export interface MarkIssueDispatchedInput {
  projectId: string;
  issueNumber: number;
  title: string;
  sessionId: string | null;
}

export interface CreateTaskLoopInput {
  id: string;
  projectId: string;
  name: string;
  agent: string;
  status: string;
  totalTasks: number;
}

export interface UpdateTaskLoopInput {
  agent?: string;
  status?: string;
  currentTaskIndex?: number;
  sessionId?: string | null;
  completedAt?: string | null;
}

export interface CreateTaskLoopTaskInput {
  loopId: string;
  taskIndex: number;
  title: string;
}

export interface UpdateTaskLoopTaskInput {
  status?: string;
  startedAt?: string | null;
  completedAt?: string | null;
}

interface MigrationDefinition {
  name: string;
  sql: string;
}

const migrations: MigrationDefinition[] = [
  {
    name: "001_initial_schema",
    sql: `
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
    `
  },
  {
    name: "002_project_layouts",
    sql: `
      CREATE TABLE IF NOT EXISTS project_layouts (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        active_session_id TEXT REFERENCES terminal_sessions(id) ON DELETE SET NULL,
        terminal_mode TEXT NOT NULL,
        diff_mode TEXT NOT NULL,
        selected_file_path TEXT,
        updated_at TEXT NOT NULL
      );
    `
  },
  {
    name: "003_audit_events",
    sql: `
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES terminal_sessions(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        command TEXT NOT NULL,
        risk TEXT NOT NULL,
        reason TEXT NOT NULL,
        detected_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_audit_events_project_id ON audit_events(project_id);
      CREATE INDEX IF NOT EXISTS idx_audit_events_session_id ON audit_events(session_id);
    `
  },
  {
    name: "004_github_issues",
    sql: `
      CREATE TABLE IF NOT EXISTS github_issues (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        issue_number INTEGER NOT NULL,
        title TEXT NOT NULL,
        dispatched_at TEXT NOT NULL,
        session_id TEXT REFERENCES terminal_sessions(id) ON DELETE SET NULL,
        UNIQUE(project_id, issue_number)
      );

      CREATE INDEX IF NOT EXISTS idx_github_issues_project_id ON github_issues(project_id);
    `
  },
  {
    name: "006_app_settings",
    sql: `
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `
  },
  {
    name: "005_task_loops",
    sql: `
      CREATE TABLE IF NOT EXISTS task_loops (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        agent TEXT NOT NULL,
        status TEXT NOT NULL,
        current_task_index INTEGER NOT NULL DEFAULT 0,
        total_tasks INTEGER NOT NULL,
        session_id TEXT REFERENCES terminal_sessions(id) ON DELETE SET NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS task_loop_tasks (
        id TEXT PRIMARY KEY,
        loop_id TEXT NOT NULL REFERENCES task_loops(id) ON DELETE CASCADE,
        task_index INTEGER NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        started_at TEXT,
        completed_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_task_loops_project_id ON task_loops(project_id);
      CREATE INDEX IF NOT EXISTS idx_task_loop_tasks_loop_id ON task_loop_tasks(loop_id);
    `
  }
];

export class DatabaseClient {
  private readonly db: BetterSqlite3.Database;

  constructor(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });
    this.db = new Database(filePath);
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("journal_mode = WAL");
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);

    const applied = new Set(
      this.db
        .prepare("SELECT name FROM schema_migrations ORDER BY applied_at ASC")
        .all()
        .map((row: unknown) => String((row as Record<string, unknown>).name))
    );

    const recordMigration = this.db.prepare(
      "INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)"
    );

    for (const migration of migrations) {
      if (applied.has(migration.name)) {
        continue;
      }

      this.db.transaction(() => {
        this.db.exec(migration.sql);
        recordMigration.run(migration.name, now());
      })();
    }
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

  renameWorkspace(id: string, name: string): Workspace {
    this.db
      .prepare(
        "UPDATE workspaces SET name = @name, updated_at = @updatedAt WHERE id = @id"
      )
      .run({ id, name, updatedAt: now() });

    const row = this.db
      .prepare("SELECT * FROM workspaces WHERE id = ? LIMIT 1")
      .get(id) as Record<string, unknown> | undefined;

    if (!row) {
      throw new Error(`Workspace ${id} not found`);
    }

    return mapWorkspace(row);
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

  deleteProject(projectId: string): void {
    this.db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
  }

  createProject(input: CreateProjectInput): ProjectRecord {
    const timestamp = now();
    const record = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      name: input.name,
      path: input.path,
      safeMode: input.safeMode,
      ideCommand: input.ideCommand,
      configPath: input.configPath,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO projects
            (id, workspace_id, name, path, safe_mode, ide_command, config_path, created_at, updated_at)
          VALUES
            (@id, @workspaceId, @name, @path, @safeMode, @ideCommand, @configPath, @createdAt, @updatedAt)`
        )
        .run(record);

      this.db
        .prepare(
          `INSERT INTO project_layouts
            (project_id, active_session_id, terminal_mode, diff_mode, selected_file_path, updated_at)
          VALUES
            (@projectId, @activeSessionId, @terminalMode, @diffMode, @selectedFilePath, @updatedAt)`
        )
        .run(buildDefaultProjectLayout(record.id));
    })();

    return this.getProjectById(record.id)!;
  }

  updateProjectConfig(input: UpdateProjectConfigInput): ProjectRecord {
    this.db
      .prepare(
        `UPDATE projects
         SET name = @name,
             safe_mode = @safeMode,
             ide_command = @ideCommand,
             updated_at = @updatedAt
         WHERE id = @projectId`
      )
      .run({
        projectId: input.projectId,
        name: input.name,
        safeMode: input.safeMode,
        ideCommand: input.ideCommand,
        updatedAt: now()
      });

    return this.getProjectById(input.projectId)!;
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

  getProjectLayout(projectId: string): ProjectLayoutRecord {
    const row = this.db
      .prepare("SELECT * FROM project_layouts WHERE project_id = ? LIMIT 1")
      .get(projectId) as Record<string, unknown> | undefined;

    if (row) {
      return mapProjectLayout(row);
    }

    const layout = buildDefaultProjectLayout(projectId);

    this.db
      .prepare(
        `INSERT INTO project_layouts
          (project_id, active_session_id, terminal_mode, diff_mode, selected_file_path, updated_at)
        VALUES
          (@projectId, @activeSessionId, @terminalMode, @diffMode, @selectedFilePath, @updatedAt)`
      )
      .run(layout);

    return layout;
  }

  saveProjectLayout(input: SaveProjectLayoutInput): ProjectLayoutRecord {
    const record = {
      projectId: input.projectId,
      activeSessionId: input.activeSessionId,
      terminalMode: input.terminalMode,
      diffMode: input.diffMode,
      selectedFilePath: input.selectedFilePath,
      updatedAt: now()
    };

    this.db
      .prepare(
        `INSERT INTO project_layouts
          (project_id, active_session_id, terminal_mode, diff_mode, selected_file_path, updated_at)
        VALUES
          (@projectId, @activeSessionId, @terminalMode, @diffMode, @selectedFilePath, @updatedAt)
        ON CONFLICT(project_id) DO UPDATE SET
          active_session_id = excluded.active_session_id,
          terminal_mode = excluded.terminal_mode,
          diff_mode = excluded.diff_mode,
          selected_file_path = excluded.selected_file_path,
          updated_at = excluded.updated_at`
      )
      .run(record);

    return this.getProjectLayout(input.projectId);
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

  createAuditEvent(input: CreateAuditEventInput): AuditEvent {
    const record = {
      id: randomUUID(),
      sessionId: input.sessionId,
      projectId: input.projectId,
      command: input.command,
      risk: input.risk,
      reason: input.reason,
      detectedAt: now()
    };

    this.db
      .prepare(
        `INSERT INTO audit_events
          (id, session_id, project_id, command, risk, reason, detected_at)
        VALUES
          (@id, @sessionId, @projectId, @command, @risk, @reason, @detectedAt)`
      )
      .run(record);

    return {
      id: record.id,
      sessionId: record.sessionId,
      projectId: record.projectId,
      command: record.command,
      risk: record.risk as AuditRisk,
      reason: record.reason,
      detectedAt: record.detectedAt
    };
  }

  listAuditEvents(projectId: string): AuditEvent[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM audit_events WHERE project_id = ? ORDER BY detected_at DESC"
      )
      .all(projectId);

    return rows.map((row: unknown) => mapAuditEvent(row as Record<string, unknown>));
  }

  isIssueDispatched(projectId: string, issueNumber: number): boolean {
    const row = this.db
      .prepare(
        "SELECT id FROM github_issues WHERE project_id = ? AND issue_number = ? LIMIT 1"
      )
      .get(projectId, issueNumber);

    return row !== undefined;
  }

  markIssueDispatched(input: MarkIssueDispatchedInput): GitHubIssueRecord {
    const record = {
      id: randomUUID(),
      projectId: input.projectId,
      issueNumber: input.issueNumber,
      title: input.title,
      dispatchedAt: now(),
      sessionId: input.sessionId
    };

    this.db
      .prepare(
        `INSERT INTO github_issues
          (id, project_id, issue_number, title, dispatched_at, session_id)
        VALUES
          (@id, @projectId, @issueNumber, @title, @dispatchedAt, @sessionId)
        ON CONFLICT(project_id, issue_number) DO UPDATE SET
          session_id = excluded.session_id,
          dispatched_at = excluded.dispatched_at`
      )
      .run(record);

    return mapGitHubIssueRecord({
      id: record.id,
      project_id: record.projectId,
      issue_number: record.issueNumber,
      title: record.title,
      dispatched_at: record.dispatchedAt,
      session_id: record.sessionId
    });
  }

  listDispatchedIssues(projectId: string): GitHubIssueRecord[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM github_issues WHERE project_id = ? ORDER BY dispatched_at DESC"
      )
      .all(projectId);

    return rows.map((row: unknown) => mapGitHubIssueRecord(row as Record<string, unknown>));
  }

  createTaskLoop(input: CreateTaskLoopInput): TaskLoopRecord {
    const record = {
      id: input.id,
      projectId: input.projectId,
      name: input.name,
      agent: input.agent,
      status: input.status,
      currentTaskIndex: 0,
      totalTasks: input.totalTasks,
      sessionId: null,
      startedAt: now(),
      completedAt: null
    };

    this.db
      .prepare(
        `INSERT INTO task_loops
          (id, project_id, name, agent, status, current_task_index, total_tasks, session_id, started_at, completed_at)
        VALUES
          (@id, @projectId, @name, @agent, @status, @currentTaskIndex, @totalTasks, @sessionId, @startedAt, @completedAt)`
      )
      .run(record);

    return this.getTaskLoopById(input.id)!;
  }

  updateTaskLoop(loopId: string, input: UpdateTaskLoopInput): void {
    const parts: string[] = [];
    const params: Record<string, unknown> = { loopId };

    if (input.status !== undefined) {
      parts.push("status = @status");
      params.status = input.status;
    }
    if (input.currentTaskIndex !== undefined) {
      parts.push("current_task_index = @currentTaskIndex");
      params.currentTaskIndex = input.currentTaskIndex;
    }
    if ("sessionId" in input) {
      parts.push("session_id = @sessionId");
      params.sessionId = input.sessionId ?? null;
    }
    if ("completedAt" in input) {
      parts.push("completed_at = @completedAt");
      params.completedAt = input.completedAt ?? null;
    }

    if (parts.length === 0) return;

    this.db
      .prepare(`UPDATE task_loops SET ${parts.join(", ")} WHERE id = @loopId`)
      .run(params);
  }

  getTaskLoopById(loopId: string): TaskLoopRecord | null {
    const row = this.db
      .prepare("SELECT * FROM task_loops WHERE id = ? LIMIT 1")
      .get(loopId) as Record<string, unknown> | undefined;

    return row ? mapTaskLoop(row) : null;
  }

  listTaskLoops(projectId: string): TaskLoopRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM task_loops WHERE project_id = ? ORDER BY started_at DESC")
      .all(projectId);

    return rows.map((row: unknown) => mapTaskLoop(row as Record<string, unknown>));
  }

  createTaskLoopTask(input: CreateTaskLoopTaskInput): TaskLoopTaskRecord {
    const record = {
      id: randomUUID(),
      loopId: input.loopId,
      taskIndex: input.taskIndex,
      title: input.title,
      status: "pending",
      startedAt: null,
      completedAt: null
    };

    this.db
      .prepare(
        `INSERT INTO task_loop_tasks
          (id, loop_id, task_index, title, status, started_at, completed_at)
        VALUES
          (@id, @loopId, @taskIndex, @title, @status, @startedAt, @completedAt)`
      )
      .run(record);

    return this.getTaskLoopTaskByIndex(input.loopId, input.taskIndex)!;
  }

  updateTaskLoopTask(taskId: string, input: UpdateTaskLoopTaskInput): void {
    const parts: string[] = [];
    const params: Record<string, unknown> = { taskId };

    if (input.status !== undefined) {
      parts.push("status = @status");
      params.status = input.status;
    }
    if ("startedAt" in input) {
      parts.push("started_at = @startedAt");
      params.startedAt = input.startedAt ?? null;
    }
    if ("completedAt" in input) {
      parts.push("completed_at = @completedAt");
      params.completedAt = input.completedAt ?? null;
    }

    if (parts.length === 0) return;

    this.db
      .prepare(`UPDATE task_loop_tasks SET ${parts.join(", ")} WHERE id = @taskId`)
      .run(params);
  }

  getTaskLoopTaskByIndex(loopId: string, taskIndex: number): TaskLoopTaskRecord | null {
    const row = this.db
      .prepare("SELECT * FROM task_loop_tasks WHERE loop_id = ? AND task_index = ? LIMIT 1")
      .get(loopId, taskIndex) as Record<string, unknown> | undefined;

    return row ? mapTaskLoopTask(row) : null;
  }

  listTaskLoopTasks(loopId: string): TaskLoopTaskRecord[] {
    const rows = this.db
      .prepare("SELECT * FROM task_loop_tasks WHERE loop_id = ? ORDER BY task_index ASC")
      .all(loopId);

    return rows.map((row: unknown) => mapTaskLoopTask(row as Record<string, unknown>));
  }

  deleteTaskLoop(loopId: string): void {
    this.db.prepare("DELETE FROM task_loops WHERE id = ?").run(loopId);
  }

  getAppSetting(key: string): string | null {
    const row = this.db
      .prepare("SELECT value FROM app_settings WHERE key = ? LIMIT 1")
      .get(key) as Record<string, unknown> | undefined;
    return row ? String(row.value) : null;
  }

  setAppSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(key, value, now());
  }
}
