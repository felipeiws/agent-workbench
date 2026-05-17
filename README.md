# Agent Workbench / ForgeDesk UI

Mission Control para developers executarem múltiplos agentes de IA em terminais isolados por projeto, com observabilidade operacional, watch de mudanças Git, diff visual e histórico persistido localmente.

## Visão do produto

Agent Workbench nasce para resolver um problema específico de fluxo local com agentes: quando vários agentes estão operando no mesmo laptop e em vários projetos, o contexto operacional se perde. Este desktop app organiza workspaces, projetos, terminais PTY isolados, mudanças Git por projeto, diff e histórico em uma única janela Linux-first.

## Arquitetura

Monorepo npm workspaces com uma aplicação Electron e packages por domínio:

- `apps/desktop`: shell Electron, preload, IPC tipado e frontend React/Vite.
- `packages/core`: composição dos serviços e regras de orquestração.
- `packages/database`: bootstrap SQLite e persistência base.
- `packages/terminal`: gerenciamento de sessões PTY via `node-pty`.
- `packages/git`: integração Git via `child_process`.
- `packages/watcher`: observação de filesystem com debounce via `chokidar`.
- `packages/shared`: schemas, IPC contracts e heurísticas compartilhadas.
- `packages/types`: tipos centrais do domínio.
- `packages/ui`: primitives UI no estilo `shadcn/ui`.

## Stack

- Electron
- React + TypeScript + Vite
- Zustand
- Tailwind CSS
- xterm.js
- node-pty
- chokidar
- Git CLI via `child_process`
- SQLite + `better-sqlite3`
- Zod
- React Router
- lucide-react
- pino
- Vitest
- Electron Builder com target AppImage

## Instalação

Pré-requisitos:

- Linux
- Node.js 22+
- npm 11+
- `bash`
- `git`
- build essentials para módulos nativos (`better-sqlite3`, `node-pty`)

Instalação:

```bash
npm install
```

## Como rodar

Desenvolvimento:

```bash
npm run dev
```

Validação:

```bash
npm run lint
npm run typecheck
npm run test
```

Build de compilação:

```bash
npm run build
```

## Build Linux

Empacotamento AppImage:

```bash
npm run package:linux
```

Saída esperada:

- `apps/desktop/release/`

## MVP implementado

- Monorepo com boundaries explícitos
- Bootstrap Electron + React + Vite
- IPC tipado entre renderer e main
- Persistência SQLite para workspaces, projetos, sessões e chunks de terminal
- Config loader com schema Zod para `.agent-workspace.json`
- Painel global de agentes ativos
- Layout inicial funcional com sidebar, terminal, changes, diff e history
- Renderização de terminal com `xterm.js`
- Spawn de PTYs Linux com `bash`
- Git status, stage, unstage, diff e history via CLI
- Modo `safeMode: audit`
- UI mockada ForgeDesk com layout em quatro painéis e navegação desktop-first

## UI atual

- O renderer atual aplica o design ForgeDesk com mock data local para validar layout e estados visuais.
- Dados da interface vivem em `apps/desktop/src/renderer/lib/forgedesk-mocks.ts`.
- A integração completa do shell visual com PTY/Git reais pode ser feita depois sem quebrar os boundaries do monorepo.

## Troubleshooting

`npm install` falha em módulos nativos:

- Instale toolchain de build do sistema.
- Verifique se está usando Node 22+.

`npm run dev` abre janela sem dados:

- O app faz seed de projetos de exemplo apontando para `/home/felipe/Projetos`.
- Se algum diretório não for Git repo, o app exibe fallback funcional para diff/history.

`phpstorm` não abre:

- O comando de IDE é configurado por projeto.
- Ajuste o valor em `.agent-workspace.json` para um executável disponível no PATH.

AppImage falha no empacotamento:

- `electron-builder` pode precisar baixar artefatos na primeira execução.
- Rode `npm run build` primeiro para validar a compilação antes do empacotamento.
