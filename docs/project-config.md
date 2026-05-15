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
      "command": "codex"
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

Se o arquivo não existir, o sistema gera uma configuração default em memória com:

- `safeMode: "audit"`
- `ide.command: "phpstorm"`
- templates `Shell`, `Codex` e `Claude`
