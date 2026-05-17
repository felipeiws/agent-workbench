import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname } from "node:path";
const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
function now() {
    return new Date().toISOString();
}
function mapWorkspace(row) {
    return {
        id: String(row.id),
        name: String(row.name),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at)
    };
}
function mapProject(row) {
    return {
        id: String(row.id),
        workspaceId: String(row.workspace_id),
        name: String(row.name),
        path: String(row.path),
        safeMode: row.safe_mode,
        ideCommand: String(row.ide_command),
        configPath: String(row.config_path),
        createdAt: String(row.created_at),
        updatedAt: String(row.updated_at)
    };
}
function mapTerminalSession(row) {
    return {
        id: String(row.id),
        projectId: String(row.project_id),
        name: String(row.name),
        command: String(row.command),
        cwd: String(row.cwd),
        state: row.state,
        startedAt: String(row.started_at),
        completedAt: row.completed_at ? String(row.completed_at) : null,
        exitCode: typeof row.exit_code === "number" ? row.exit_code : null
    };
}
function mapTerminalChunk(row) {
    return {
        id: String(row.id),
        sessionId: String(row.session_id),
        stream: row.stream,
        content: String(row.content),
        createdAt: String(row.created_at)
    };
}
function mapProjectLayout(row) {
    return {
        projectId: String(row.project_id),
        activeSessionId: row.active_session_id ? String(row.active_session_id) : null,
        terminalMode: row.terminal_mode,
        diffMode: row.diff_mode,
        selectedFilePath: row.selected_file_path ? String(row.selected_file_path) : null,
        updatedAt: String(row.updated_at)
    };
}
function mapAuditEvent(row) {
    return {
        id: String(row.id),
        sessionId: String(row.session_id),
        projectId: String(row.project_id),
        command: String(row.command),
        risk: row.risk,
        reason: String(row.reason),
        detectedAt: String(row.detected_at)
    };
}
function mapGitHubIssueRecord(row) {
    return {
        id: String(row.id),
        projectId: String(row.project_id),
        issueNumber: Number(row.issue_number),
        title: String(row.title),
        dispatchedAt: String(row.dispatched_at),
        sessionId: row.session_id ? String(row.session_id) : null
    };
}
function buildDefaultProjectLayout(projectId) {
    return {
        projectId,
        activeSessionId: null,
        terminalMode: "focus",
        diffMode: "side-by-side",
        selectedFilePath: null,
        updatedAt: now()
    };
}
const migrations = [
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
    }
];
export class DatabaseClient {
    db;
    constructor(filePath) {
        mkdirSync(dirname(filePath), { recursive: true });
        this.db = new Database(filePath);
        this.db.pragma("foreign_keys = ON");
        this.db.pragma("journal_mode = WAL");
        this.migrate();
    }
    migrate() {
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
        const applied = new Set(this.db
            .prepare("SELECT name FROM schema_migrations ORDER BY applied_at ASC")
            .all()
            .map((row) => String(row.name)));
        const recordMigration = this.db.prepare("INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)");
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
    close() {
        this.db.close();
    }
    listWorkspaces() {
        const rows = this.db.prepare("SELECT * FROM workspaces ORDER BY name").all();
        return rows.map((row) => mapWorkspace(row));
    }
    createWorkspace(name) {
        const record = {
            id: randomUUID(),
            name,
            createdAt: now(),
            updatedAt: now()
        };
        this.db
            .prepare("INSERT INTO workspaces (id, name, created_at, updated_at) VALUES (@id, @name, @createdAt, @updatedAt)")
            .run(record);
        return {
            id: record.id,
            name: record.name,
            createdAt: record.createdAt,
            updatedAt: record.updatedAt
        };
    }
    renameWorkspace(id, name) {
        this.db
            .prepare("UPDATE workspaces SET name = @name, updated_at = @updatedAt WHERE id = @id")
            .run({ id, name, updatedAt: now() });
        const row = this.db
            .prepare("SELECT * FROM workspaces WHERE id = ? LIMIT 1")
            .get(id);
        if (!row) {
            throw new Error(`Workspace ${id} not found`);
        }
        return mapWorkspace(row);
    }
    getWorkspaceByName(name) {
        const row = this.db
            .prepare("SELECT * FROM workspaces WHERE name = ? LIMIT 1")
            .get(name);
        return row ? mapWorkspace(row) : null;
    }
    listProjects() {
        const rows = this.db
            .prepare("SELECT * FROM projects ORDER BY workspace_id, name")
            .all();
        return rows.map((row) => mapProject(row));
    }
    getProjectById(projectId) {
        const row = this.db
            .prepare("SELECT * FROM projects WHERE id = ? LIMIT 1")
            .get(projectId);
        return row ? mapProject(row) : null;
    }
    getProjectByPath(projectPath) {
        const row = this.db
            .prepare("SELECT * FROM projects WHERE path = ? LIMIT 1")
            .get(projectPath);
        return row ? mapProject(row) : null;
    }
    deleteProject(projectId) {
        this.db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
    }
    createProject(input) {
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
                .prepare(`INSERT INTO projects
            (id, workspace_id, name, path, safe_mode, ide_command, config_path, created_at, updated_at)
          VALUES
            (@id, @workspaceId, @name, @path, @safeMode, @ideCommand, @configPath, @createdAt, @updatedAt)`)
                .run(record);
            this.db
                .prepare(`INSERT INTO project_layouts
            (project_id, active_session_id, terminal_mode, diff_mode, selected_file_path, updated_at)
          VALUES
            (@projectId, @activeSessionId, @terminalMode, @diffMode, @selectedFilePath, @updatedAt)`)
                .run(buildDefaultProjectLayout(record.id));
        })();
        return this.getProjectById(record.id);
    }
    updateProjectConfig(input) {
        this.db
            .prepare(`UPDATE projects
         SET name = @name,
             safe_mode = @safeMode,
             ide_command = @ideCommand,
             updated_at = @updatedAt
         WHERE id = @projectId`)
            .run({
            projectId: input.projectId,
            name: input.name,
            safeMode: input.safeMode,
            ideCommand: input.ideCommand,
            updatedAt: now()
        });
        return this.getProjectById(input.projectId);
    }
    listTerminalSessions(projectId) {
        const rows = projectId
            ? this.db
                .prepare("SELECT * FROM terminal_sessions WHERE project_id = ? ORDER BY started_at DESC")
                .all(projectId)
            : this.db
                .prepare("SELECT * FROM terminal_sessions ORDER BY started_at DESC")
                .all();
        return rows.map((row) => mapTerminalSession(row));
    }
    createTerminalSession(input) {
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
            .prepare(`INSERT INTO terminal_sessions
          (id, project_id, name, command, cwd, state, started_at)
        VALUES
          (@id, @projectId, @name, @command, @cwd, @state, @startedAt)`)
            .run(record);
        return this.getTerminalSessionById(record.id);
    }
    getTerminalSessionById(sessionId) {
        const row = this.db
            .prepare("SELECT * FROM terminal_sessions WHERE id = ? LIMIT 1")
            .get(sessionId);
        return row ? mapTerminalSession(row) : null;
    }
    getProjectLayout(projectId) {
        const row = this.db
            .prepare("SELECT * FROM project_layouts WHERE project_id = ? LIMIT 1")
            .get(projectId);
        if (row) {
            return mapProjectLayout(row);
        }
        const layout = buildDefaultProjectLayout(projectId);
        this.db
            .prepare(`INSERT INTO project_layouts
          (project_id, active_session_id, terminal_mode, diff_mode, selected_file_path, updated_at)
        VALUES
          (@projectId, @activeSessionId, @terminalMode, @diffMode, @selectedFilePath, @updatedAt)`)
            .run(layout);
        return layout;
    }
    saveProjectLayout(input) {
        const record = {
            projectId: input.projectId,
            activeSessionId: input.activeSessionId,
            terminalMode: input.terminalMode,
            diffMode: input.diffMode,
            selectedFilePath: input.selectedFilePath,
            updatedAt: now()
        };
        this.db
            .prepare(`INSERT INTO project_layouts
          (project_id, active_session_id, terminal_mode, diff_mode, selected_file_path, updated_at)
        VALUES
          (@projectId, @activeSessionId, @terminalMode, @diffMode, @selectedFilePath, @updatedAt)
        ON CONFLICT(project_id) DO UPDATE SET
          active_session_id = excluded.active_session_id,
          terminal_mode = excluded.terminal_mode,
          diff_mode = excluded.diff_mode,
          selected_file_path = excluded.selected_file_path,
          updated_at = excluded.updated_at`)
            .run(record);
        return this.getProjectLayout(input.projectId);
    }
    updateTerminalSessionState(sessionId, state, exitCode) {
        const completedAt = state === "completed" || state === "failed" ? now() : null;
        this.db
            .prepare(`UPDATE terminal_sessions
         SET state = @state, completed_at = @completedAt, exit_code = COALESCE(@exitCode, exit_code)
         WHERE id = @sessionId`)
            .run({
            sessionId,
            state,
            completedAt,
            exitCode: typeof exitCode === "number" ? exitCode : null
        });
        return this.getTerminalSessionById(sessionId);
    }
    appendTerminalChunk(sessionId, stream, content) {
        const record = {
            id: randomUUID(),
            sessionId,
            stream,
            content,
            createdAt: now()
        };
        this.db
            .prepare(`INSERT INTO terminal_chunks
          (id, session_id, stream, content, created_at)
        VALUES
          (@id, @sessionId, @stream, @content, @createdAt)`)
            .run(record);
        return record;
    }
    getTerminalChunks(sessionId) {
        const rows = this.db
            .prepare("SELECT * FROM terminal_chunks WHERE session_id = ? ORDER BY created_at ASC")
            .all(sessionId);
        return rows.map((row) => mapTerminalChunk(row));
    }
    createAuditEvent(input) {
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
            .prepare(`INSERT INTO audit_events
          (id, session_id, project_id, command, risk, reason, detected_at)
        VALUES
          (@id, @sessionId, @projectId, @command, @risk, @reason, @detectedAt)`)
            .run(record);
        return {
            id: record.id,
            sessionId: record.sessionId,
            projectId: record.projectId,
            command: record.command,
            risk: record.risk,
            reason: record.reason,
            detectedAt: record.detectedAt
        };
    }
    listAuditEvents(projectId) {
        const rows = this.db
            .prepare("SELECT * FROM audit_events WHERE project_id = ? ORDER BY detected_at DESC")
            .all(projectId);
        return rows.map((row) => mapAuditEvent(row));
    }
    isIssueDispatched(projectId, issueNumber) {
        const row = this.db
            .prepare("SELECT id FROM github_issues WHERE project_id = ? AND issue_number = ? LIMIT 1")
            .get(projectId, issueNumber);
        return row !== undefined;
    }
    markIssueDispatched(input) {
        const record = {
            id: randomUUID(),
            projectId: input.projectId,
            issueNumber: input.issueNumber,
            title: input.title,
            dispatchedAt: now(),
            sessionId: input.sessionId
        };
        this.db
            .prepare(`INSERT INTO github_issues
          (id, project_id, issue_number, title, dispatched_at, session_id)
        VALUES
          (@id, @projectId, @issueNumber, @title, @dispatchedAt, @sessionId)
        ON CONFLICT(project_id, issue_number) DO UPDATE SET
          session_id = excluded.session_id,
          dispatched_at = excluded.dispatched_at`)
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
    listDispatchedIssues(projectId) {
        const rows = this.db
            .prepare("SELECT * FROM github_issues WHERE project_id = ? ORDER BY dispatched_at DESC")
            .all(projectId);
        return rows.map((row) => mapGitHubIssueRecord(row));
    }
}
