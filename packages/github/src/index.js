import { EventEmitter } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
const TOKEN_FILE = join(homedir(), ".config", "agent-workbench", "github-token");
const GITHUB_API = "https://api.github.com";
const DEFAULT_POLL_INTERVAL_MS = 30_000;
export function readGitHubToken() {
    if (process.env.GITHUB_TOKEN) {
        return process.env.GITHUB_TOKEN.trim();
    }
    if (existsSync(TOKEN_FILE)) {
        return readFileSync(TOKEN_FILE, "utf8").trim() || null;
    }
    return null;
}
export class GitHubClient {
    token;
    constructor(token) {
        this.token = token;
    }
    async listIssues(owner, repo, labels) {
        const labelParam = labels.join(",");
        const url = `${GITHUB_API}/repos/${owner}/${repo}/issues?state=open&labels=${encodeURIComponent(labelParam)}&per_page=50`;
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"
            }
        });
        if (!response.ok) {
            throw new Error(`GitHub API error ${response.status}: ${await response.text()}`);
        }
        const data = (await response.json());
        return data.map((item) => ({
            id: item.id,
            number: item.number,
            title: item.title,
            body: item.body ?? null,
            labels: item.labels.map((label) => label.name),
            url: item.html_url
        }));
    }
    async getIssue(owner, repo, issueNumber) {
        const url = `${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}`;
        const response = await fetch(url, {
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28"
            }
        });
        if (!response.ok) {
            throw new Error(`GitHub API error ${response.status}: ${await response.text()}`);
        }
        const item = (await response.json());
        return {
            id: item.id,
            number: item.number,
            title: item.title,
            body: item.body ?? null,
            labels: item.labels.map((label) => label.name),
            url: item.html_url
        };
    }
    async postComment(owner, repo, issueNumber, body) {
        const url = `${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ body })
        });
        if (!response.ok) {
            throw new Error(`GitHub API error ${response.status}: ${await response.text()}`);
        }
    }
    async addLabel(owner, repo, issueNumber, label) {
        const url = `${GITHUB_API}/repos/${owner}/${repo}/issues/${issueNumber}/labels`;
        const response = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.token}`,
                Accept: "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ labels: [label] })
        });
        if (!response.ok) {
            throw new Error(`GitHub API error ${response.status}: ${await response.text()}`);
        }
    }
}
export class GitHubService {
    events = new EventEmitter();
    pollers = new Map();
    startWatchingProject(projectId, config) {
        if (this.pollers.has(projectId)) {
            return;
        }
        const token = readGitHubToken();
        if (!token) {
            return;
        }
        const client = new GitHubClient(token);
        const intervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
        const seenIssueIds = new Set();
        const poll = async () => {
            const entry = this.pollers.get(projectId);
            if (!entry)
                return;
            try {
                const issues = await client.listIssues(config.owner, config.repo, config.labels);
                for (const issue of issues) {
                    if (!entry.seenIssueIds.has(issue.number)) {
                        this.events.emit("issuePolled", { projectId, issue });
                    }
                }
                entry.seenIssueIds = new Set(issues.map((issue) => issue.number));
            }
            catch {
                // polling errors are non-fatal — will retry next interval
            }
        };
        const timer = setInterval(() => void poll(), intervalMs);
        this.pollers.set(projectId, { timer, config, client, seenIssueIds });
        // Run first poll immediately instead of waiting for the first interval
        void poll();
    }
    stopWatchingProject(projectId) {
        const entry = this.pollers.get(projectId);
        if (entry) {
            clearInterval(entry.timer);
            this.pollers.delete(projectId);
        }
    }
    async listIssues(projectId, config) {
        const token = readGitHubToken();
        if (!token) {
            throw new Error("GitHub token not configured. Set GITHUB_TOKEN or create ~/.config/agent-workbench/github-token");
        }
        const client = new GitHubClient(token);
        return client.listIssues(config.owner, config.repo, config.labels);
    }
    async getIssue(config, issueNumber) {
        const token = readGitHubToken();
        if (!token) {
            throw new Error("GitHub token not configured. Set GITHUB_TOKEN or create ~/.config/agent-workbench/github-token");
        }
        const client = new GitHubClient(token);
        return client.getIssue(config.owner, config.repo, issueNumber);
    }
    async postComment(config, issueNumber, body) {
        const token = readGitHubToken();
        if (!token) {
            return;
        }
        const client = new GitHubClient(token);
        try {
            await client.postComment(config.owner, config.repo, issueNumber, body);
        }
        catch {
            // comment posting is best-effort
        }
    }
    onIssuePolled(listener) {
        this.events.on("issuePolled", listener);
    }
    stopAll() {
        for (const [projectId] of this.pollers) {
            this.stopWatchingProject(projectId);
        }
    }
}
