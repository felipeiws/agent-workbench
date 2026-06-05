import { useEffect, useState } from "react";

import { fetchAppSettings, saveAppSettings } from "../lib/queries";

export function GeneralSettingsPanel() {
  const [editorCommand, setEditorCommand] = useState("");
  const [gitToken, setGitToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchAppSettings().then((s) => {
      setEditorCommand(s.editorCommand || "");
      setGitToken(s.gitToken || "");
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await saveAppSettings({ editorCommand: editorCommand.trim(), gitToken: gitToken.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao salvar configurações.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fd-ai-settings">
      <div className="fd-config-section">
        <div className="fd-config-section-title">Editor de Código</div>
        <div className="fd-form-group">
          <label className="fd-form-label" htmlFor="editor-command">
            Comando do editor
            <span className="fd-form-hint">ex: code, cursor, zed, nvim — deixe vazio para usar o editor configurado no projeto</span>
          </label>
          <input
            className="fd-form-input"
            id="editor-command"
            type="text"
            placeholder="code"
            value={editorCommand}
            onChange={(e) => setEditorCommand(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
      </div>

      <div className="fd-config-section">
        <div className="fd-config-section-title">Git</div>
        <div className="fd-form-group">
          <label className="fd-form-label" htmlFor="git-token">
            Token de acesso
            <span className="fd-form-hint">Personal Access Token (PAT) usado no Commit &amp; Push via HTTPS</span>
          </label>
          <input
            className="fd-form-input"
            id="git-token"
            type="password"
            placeholder="ghp_…"
            value={gitToken}
            onChange={(e) => setGitToken(e.target.value)}
            spellCheck={false}
            autoComplete="new-password"
          />
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
