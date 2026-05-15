# Architectural Decision Records

## ADR-001 Linux-first

- Status: Accepted
- Context: o uso de PTY, shell e IDE local é altamente dependente do ambiente.
- Decision: o MVP suportará apenas Linux.
- Consequences: simplifica spawn, packaging e suporte inicial.

## ADR-002 Electron desktop shell

- Status: Accepted
- Context: o produto precisa de acesso local confiável a processos, filesystem e banco.
- Decision: Electron será o shell desktop.
- Consequences: acesso nativo com UX única e packaging distribuível.

## ADR-003 React + Vite no renderer

- Status: Accepted
- Context: a UI precisa iterar rápido e suportar um layout operacional rico.
- Decision: React com Vite no renderer.
- Consequences: DX rápida, hot reload e ecossistema maduro.

## ADR-004 Zustand para estado do renderer

- Status: Accepted
- Context: o estado do app é concentrado e operacional.
- Decision: Zustand.
- Consequences: store simples, sem boilerplate excessivo.

## ADR-005 SQLite local com better-sqlite3

- Status: Accepted
- Context: histórico e sessões precisam sobreviver a reboots sem infraestrutura extra.
- Decision: SQLite com `better-sqlite3`.
- Consequences: persistência síncrona e simples para o processo principal.

## ADR-006 Configuração por projeto em JSON

- Status: Accepted
- Context: cada projeto precisa declarar ide, safeMode e templates de terminais.
- Decision: usar `.agent-workspace.json`.
- Consequences: configuração versionável ao lado do projeto.

## ADR-007 Git via CLI

- Status: Accepted
- Context: o MVP precisa de previsibilidade e baixo acoplamento.
- Decision: integrar Git via `child_process`.
- Consequences: sem abstrações externas prematuras; parsing explícito.

## ADR-008 Diff side-by-side por padrão

- Status: Accepted
- Context: revisão operacional entre mudanças concorrentes precisa de comparação visual clara.
- Decision: side-by-side é o modo default; inline é toggle.
- Consequences: melhor legibilidade para mudanças paralelas.

## ADR-009 PTY isolation

- Status: Accepted
- Context: agentes não podem compartilhar ciclo de vida e buffers.
- Decision: cada terminal possui exatamente um PTY e um lifecycle.
- Consequences: isolamento forte e rastreabilidade melhor.

## ADR-010 Safe mode audit no MVP

- Status: Accepted
- Context: o produto precisa começar exibindo e registrando comportamento antes de bloquear ações.
- Decision: apenas `audit` é implementado no MVP.
- Consequences: prepara a base para `protect` sem travar a primeira release.

## ADR-011 Typed IPC only

- Status: Accepted
- Context: o boundary Electron costuma degradar rápido sem contratos claros.
- Decision: todo acesso renderer/main passa por IPC tipado.
- Consequences: melhor evolutividade e menos regressões implícitas.
