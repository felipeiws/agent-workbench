# Project Config

## Arquivo

- Nome: `.agent-workspace.json`
- Local: raiz do projeto monitorado

## Objetivo

Definir identidade do projeto, modo de segurança, comando da IDE e templates de terminais/agentes.

## Schema

```json
{
  "project": "bridge",
  "safeMode": "audit",
  "ide": {
    "command": "phpstorm"
  },
  "terminals": [
    {
      "name": "Codex",
      "type": "agent",
      "command": "codex --dangerously-bypass-approvals-and-sandbox --no-alt-screen"
    },
    {
      "name": "Claude",
      "type": "agent",
      "command": "claude"
    }
  ]
}
```

## Campos

- `project`: nome lógico do projeto.
- `safeMode`: `off | audit | protect`. MVP opera efetivamente em `audit`.
- `ide.command`: executável para abrir projeto ou arquivo.
- `terminals`: lista de templates inicializáveis pela UI.

## Tipos de terminal

- `agent`: terminal de agente de IA.
- `shell`: shell manual.
- `task`: comando operacional específico.

## Fallback

Se o arquivo não existir, o sistema gera uma configuração default auditável e escreve `.agent-workspace.json` na raiz do projeto com:

- `safeMode: "audit"`
- `ide.command: "phpstorm"`
- templates `Shell`, `Codex` e `Claude`

## Sync local

- Toda leitura do arquivo passa por validação Zod.
- `project`, `safeMode` e `ide.command` são sincronizados com a tabela `projects` no SQLite local.
- O comando da IDE usado pelo main process sempre vem da configuração validada do projeto.
- Os templates em `terminals` abastecem a UI para criação de sessões pré-configuradas.
- Quando o comando começa com `codex`, o main normaliza a sessão para garantir um modo compatível com o runtime desktop, adicionando flags de sandbox/aprovação e preservação de scrollback quando elas não foram declaradas explicitamente.
