# Architecture

## Visão geral

O sistema é um monorepo com uma aplicação Electron que hospeda uma UI React. O renderer conversa com o processo principal apenas por IPC tipado. O processo principal compõe os serviços de domínio e faz mediação com recursos locais: filesystem, PTY, SQLite, Git CLI e IDE.

## Módulos

### `apps/desktop`

- Inicializa a janela Electron.
- Registra handlers IPC.
- Expõe API segura no preload.
- Renderiza a interface React com Zustand e xterm.js.

### `packages/core`

- Compõe serviços.
- Garante workspace local default quando o banco está vazio.
- Importa projetos locais selecionados no Electron.
- Carrega configuração do projeto.
- Monta snapshots agregando DB + Git + heurísticas.
- Orquestra abertura de IDE.

### `packages/database`

- Inicializa SQLite.
- Cria schema inicial.
- Persiste workspaces, projetos, sessões e chunks.

### `packages/terminal`

- Faz spawn de PTYs com `node-pty`.
- Encaminha output, exit, write e resize.

### `packages/git`

- Executa Git CLI via `execFile`.
- Interpreta `git status --short`.
- Fornece stage, unstage, diff e history.

### `packages/watcher`

- Observa mudanças de filesystem com debounce.
- É a base para refresh Git orientado a eventos.

## Boundaries

- `renderer -> preload -> ipc -> core services`
- `core -> database | git | terminal`
- `shared -> types`
- `ui` é renderer-only e sem lógica de negócio

## Eventos

Eventos atuais:

- `terminals:output`
- `terminals:exit`

Eventos futuros previstos:

- `git:status-updated`
- `watcher:project-changed`
- `history:refreshed`

## Lifecycle de terminal

1. Renderer solicita `terminals:create`.
2. Main resolve projeto e persiste uma sessão em `running`.
3. `node-pty` sobe um shell `bash`.
4. Output é persistido em `terminal_chunks`.
5. Renderer recebe stream via IPC e escreve no xterm.
6. O renderer pode reidratar o xterm lendo `terminal_chunks` persistidos ao reabrir o app.
7. Exit atualiza a sessão para `completed` ou `failed`.
8. Kill manual fecha a aba visível, mas preserva a sessão e o histórico no SQLite para auditoria.

## Lifecycle de projeto

1. Renderer solicita importação e o main abre um diálogo Electron para selecionar uma pasta local.
2. `core` valida existência da pasta e se ela é um repositório Git.
3. Projeto é registrado localmente com path absoluto no workspace selecionado.
4. Config loader tenta ler `.agent-workspace.json`.
5. Se não houver arquivo, gera e persiste config default auditável.
6. Git facade agrega status, diff e histórico.
7. Snapshot abastece a UI.
