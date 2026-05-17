# UI Notes

## ForgeDesk renderer

O renderer desktop expõe a interface ForgeDesk consumindo snapshot real via IPC tipado entre renderer, preload e main process.

## Estrutura

- Topbar com branding ForgeDesk, breadcrumb de workspace/projeto, agentes ativos e indicador de safe mode.
- Layout principal em quatro painéis: `Workspace | Terminals | Changes | Diff/History`.
- Sidebar com tabs de workspace, lista de projetos, indicadores de estado e atalhos recentes.
- Painel de terminais com `focus mode` por tabs e `grid mode` 2x2.
- Painel de changes com grupos Git, filtro e atribuição multi-agent.
- Painel de diff com toggle `side-by-side`/`inline` e quick history embutido.

## Dados

- Os dados vêm de `app:get-snapshot`, `projects:*`, `git:*` e `terminals:*`.
- A importação de projeto local acontece pelo botão `Add project`, que aciona diálogo Electron no main process.
- A UI opera com estados vazios reais quando ainda não há projeto importado.

## Tokens visuais

- Tema base: warm graphite dark.
- Tipografia prevista: `Geist` para UI e `JetBrains Mono` para código, com fallbacks locais.
- Acento primário: bronze `#d49b5b`.
- Estados:
  - running: amber
  - waiting: burnt orange
  - completed: moss green
  - error: terracotta
