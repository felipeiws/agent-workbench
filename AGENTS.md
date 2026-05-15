# AGENTS

## Visão do produto

Agent Workbench é uma desktop application Linux-first para coordenar múltiplos agentes de IA em projetos locais, cada um com isolamento operacional por terminal/PTy, visibilidade Git e histórico persistido.

## Regras arquiteturais

- `apps/desktop` não concentra lógica de domínio; ele compõe UI, IPC e shell Electron.
- Persistência local pertence a `packages/database`.
- Integração com Git pertence a `packages/git` e usa Git CLI diretamente.
- Orquestração cross-module pertence a `packages/core`.
- Schemas, contracts e heurísticas compartilhadas pertencem a `packages/shared`.
- Tipos puros pertencem a `packages/types`.
- UI primitives reutilizáveis pertencem a `packages/ui`.
- Cada terminal tem um PTY, um shell e um lifecycle próprios.
- Não existe compartilhamento de estado de runtime entre terminais.

## Princípios

- Linux-first, sem abstrações cross-platform prematuras.
- Tipagem rígida em todos os boundaries.
- Persistência local antes de sync/remoto.
- Git via CLI antes de bibliotecas de alto nível.
- UI operacional: estado deve ser explicável e auditável.
- Heurísticas são explicitadas; nada “mágico” sem surface visível.

## Como agentes devem trabalhar

- Ler `docs/architecture.md` antes de alterar boundaries.
- Preservar IPC tipado; evitar canais soltos.
- Manter cada package focado em uma responsabilidade.
- Ao adicionar features, registrar decisão em `docs/decisions.md`.
- Ao alterar schema SQLite ou `.agent-workspace.json`, atualizar a documentação correspondente no mesmo change.
- Não mover lógica de negócio para componentes React.

## Convenções

- TypeScript `strict`.
- Imports por aliases `@agent-workbench/*` ou `@/` no renderer.
- Sem dependência circular entre packages.
- Side effects apenas em `apps/desktop/src/main` e pontos de entrada explícitos.
- Estado global do renderer apenas via Zustand.
- Git operations via `child_process`.
- Comentários apenas quando acrescentam contexto real.

## Módulos

- `core`: composição de serviços, seed inicial, snapshot, open IDE, facades.
- `database`: migração inicial e CRUD base.
- `terminal`: spawn, write, resize, terminate, stream de output.
- `git`: status, stage, unstage, diff, history.
- `watcher`: watch com debounce.
- `shared`: schemas Zod, IPC channels, heurística multi-agent.
- `types`: modelos de dados do domínio.
- `ui`: button, card, badge, separator, scroll area, utilitários de classes.

## Boundaries

- Renderer nunca acessa filesystem ou processos diretamente.
- Main nunca depende de componentes React.
- `packages/ui` não importa serviços de domínio.
- `packages/types` não importa nenhum outro package.
- `packages/shared` pode depender de `types`, nunca do renderer.
