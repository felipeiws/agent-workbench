import { useEffect, useState } from "react";

import type { AppSettings } from "@agent-workbench/shared";
import { getDesktopApi } from "../lib/desktop-api";
import { fetchAppSettings, saveAppSettings } from "../lib/queries";

const ANTHROPIC_MODELS = [
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5 (rápido, econômico)" },
  { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6 (equilibrado)" },
  { value: "claude-opus-4-7", label: "Claude Opus 4.7 (mais capaz)" }
];

const OPENAI_MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini (rápido, econômico)" },
  { value: "gpt-4o", label: "GPT-4o (equilibrado)" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo (mais capaz)" }
];

const DEFAULT_COMMIT_PROMPT =
  "Generate a concise git commit message for these staged changes. Use conventional commits format (feat:, fix:, refactor:, chore:, docs:, style:, test:, etc.). Reply with ONLY the commit message, nothing else.";

interface AiSettingsPanelProps {
  onSaved?: () => void;
}

interface TestResult {
  ok: boolean;
  keyPreview: string;
  keyLength: number;
  error?: string;
}

export function AiSettingsPanel({ onSaved }: AiSettingsPanelProps) {
  const [provider, setProvider] = useState<AppSettings["aiProvider"]>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("claude-haiku-4-5-20251001");
  const [commitPrompt, setCommitPrompt] = useState(DEFAULT_COMMIT_PROMPT);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  useEffect(() => {
    void fetchAppSettings().then((s) => {
      setProvider(s.aiProvider);
      setApiKey(s.aiApiKey);
      setModel(s.aiModel);
      setCommitPrompt(s.commitPrompt || DEFAULT_COMMIT_PROMPT);
    });
  }, []);

  const models = provider === "anthropic" ? ANTHROPIC_MODELS : OPENAI_MODELS;

  function handleProviderChange(next: AppSettings["aiProvider"]) {
    setProvider(next);
    setModel(next === "anthropic" ? ANTHROPIC_MODELS[0]!.value : OPENAI_MODELS[0]!.value);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    setTestResult(null);
    try {
      await saveAppSettings({ aiProvider: provider, aiApiKey: apiKey.trim(), aiModel: model, commitPrompt });
      setSaved(true);
      onSaved?.();
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await getDesktopApi().app.testApiKey();
      setTestResult(result);
    } catch (err) {
      setTestResult({
        ok: false,
        keyPreview: "(erro)",
        keyLength: 0,
        error: err instanceof Error ? err.message : String(err)
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="fd-ai-settings">
      <div className="fd-config-section">
        <div className="fd-config-section-title">Provedor de IA</div>

        <div className="fd-form-row">
          <div className="fd-form-group">
            <label className="fd-form-label" htmlFor="ai-provider">Provider</label>
            <select
              className="fd-form-input"
              id="ai-provider"
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as AppSettings["aiProvider"])}
            >
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI (GPT)</option>
            </select>
          </div>

          <div className="fd-form-group">
            <label className="fd-form-label" htmlFor="ai-model">Modelo</label>
            <select
              className="fd-form-input"
              id="ai-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {models.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="fd-form-group">
          <label className="fd-form-label" htmlFor="ai-apikey">
            API Key
            <span className="fd-form-hint">armazenada localmente no banco de dados</span>
          </label>
          <div className="fd-form-input-row">
            <input
              className="fd-form-input fd-form-input--flex"
              id="ai-apikey"
              type={showKey ? "text" : "password"}
              placeholder={provider === "anthropic" ? "sk-ant-api03-..." : "sk-..."}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onPaste={(e) => {
                e.preventDefault();
                const pasted = e.clipboardData.getData("text").trim();
                setApiKey(pasted);
              }}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              className="fd-secondary-button"
              type="button"
              onClick={() => setShowKey((v) => !v)}
            >
              {showKey ? "Ocultar" : "Mostrar"}
            </button>
          </div>
          {apiKey ? (
            <span className="fd-form-hint" style={{ marginTop: 4 }}>
              {apiKey.length} chars · preview: <code style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{apiKey.slice(0, 12)}…{apiKey.slice(-4)}</code>
            </span>
          ) : null}
        </div>

        {testResult ? (
          <div className={`fd-settings-note ${testResult.ok ? "success" : "error"}`}>
            {testResult.ok ? (
              <>✓ Conexão OK · key salva no banco: <code style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{testResult.keyPreview}</code> ({testResult.keyLength} chars)</>
            ) : (
              <>✗ Falha · key no banco: <code style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{testResult.keyPreview}</code> ({testResult.keyLength} chars)<br />{testResult.error}</>
            )}
          </div>
        ) : null}
      </div>

      <div className="fd-config-section">
        <div className="fd-config-section-title">Prompt de Commit</div>
        <div className="fd-form-group">
          <label className="fd-form-label" htmlFor="ai-commit-prompt">
            Instrução para geração de mensagem de commit
          </label>
          <textarea
            className="fd-form-input fd-form-textarea"
            id="ai-commit-prompt"
            rows={4}
            value={commitPrompt}
            onChange={(e) => setCommitPrompt(e.target.value)}
            placeholder={DEFAULT_COMMIT_PROMPT}
          />
          <button
            className="fd-form-reset-link"
            type="button"
            onClick={() => setCommitPrompt(DEFAULT_COMMIT_PROMPT)}
          >
            Restaurar padrão
          </button>
        </div>
      </div>

      {error ? (
        <div className="fd-settings-note error">{error}</div>
      ) : null}
      {saved ? (
        <div className="fd-settings-note success">Configurações salvas com sucesso.</div>
      ) : null}

      <div className="fd-settings-actions">
        <button
          className="fd-secondary-button"
          type="button"
          onClick={() => void handleTest()}
          disabled={testing}
        >
          {testing ? "Testando…" : "Testar conexão"}
        </button>
        <button
          className="fd-primary-button"
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
        >
          {saving ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}
