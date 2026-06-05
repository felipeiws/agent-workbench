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

## ADR-012 Mock-first renderer redesign

- Status: Accepted
- Context: a interface ForgeDesk precisa ser validada visualmente antes da integração completa com PTY e Git reais.
- Decision: o renderer passa a ter uma camada de mock data tipada para a UI principal, preservando os boundaries existentes.
- Consequences: acelera a implementação visual sem mover lógica de domínio para React; a integração com IPC real continua como etapa posterior.

## ADR-013 Schema migrations e layout persistido por projeto

- Status: Accepted
- Context: o banco local precisa evoluir sem recriação manual e a UI operacional precisa reabrir projetos com estado básico restaurável.
- Decision: `packages/database` mantém migrations versionadas em SQLite e persiste um layout mínimo por projeto junto do histórico de terminal.
- Consequences: upgrades de schema ficam auditáveis no main process e o renderer pode restaurar sessão ativa, modo de terminal, modo de diff e arquivo selecionado via IPC tipado.

## ADR-014 Configuração por projeto como fonte de verdade operacional

- Status: Accepted
- Context: a UI e o main process precisavam parar de depender de mocks e defaults só em memória para IDE, safe mode e templates de terminal.
- Decision: `.agent-workspace.json` passa a ser materializado quando ausente, validado com Zod em toda leitura e sincronizado com a tabela `projects` no SQLite local.
- Consequences: cada projeto tem configuração auditável em disco, o main process usa o comando de IDE validado por projeto e a UI cria sessões a partir dos templates declarados no arquivo.

## ADR-015 Importação local de projetos Git

- Status: Accepted
- Context: a aplicação precisava substituir seeds/mock de projetos por um fluxo operacional real de entrada de projetos locais.
- Decision: o processo principal abre um diálogo Electron para seleção de pasta, o `core` valida existência e se a pasta é um repositório Git, e o projeto é persistido no workspace selecionado com fallback para o workspace local default.
- Consequences: o renderer continua sem acesso a filesystem/processos, a origem do projeto fica auditável no SQLite e a configuração `.agent-workspace.json` é carregada ou materializada no momento da importação.

## ADR-016 Terminal renderer com PTY real por aba

- Status: Accepted
- Context: a UI principal ainda usava representação mockada para terminal, sem input interativo, resize ou restart sobre sessões reais persistidas.
- Decision: o renderer passa a consumir sessões reais via IPC tipado, renderiza o terminal ativo com `xterm`, envia `write` e `resize` para o `TerminalManager` e expõe kill/restart como operações explícitas por aba.
- Consequences: cada aba passa a refletir um PTY isolado de verdade, o ciclo de vida do terminal fica auditável no SQLite e a UI deixa de depender de fixtures locais para a experiência principal.

## ADR-017 Scrollback persistido e fechamento manual sem perda de histórico

- Status: Accepted
- Context: o terminal precisava restaurar output real ao reabrir o app e distinguir encerramento manual de falha operacional visível.
- Decision: o renderer hidrata `xterm` a partir dos `terminal_chunks` persistidos, o scrollback fica no SQLite por sessão e um kill manual remove a aba ativa do painel sem apagar a sessão ou seus chunks.
- Consequences: a UI restaura histórico de terminal após restart da aplicação, fechamento voluntário não polui a lista de agentes ativos e o histórico segue auditável no main process.

## ADR-018 Task loop com marcador explícito de conclusão em disco

- Status: Accepted
- Context: o loop sequencial de tasks avançava por timeout de silêncio no terminal, o que podia marcar tasks como concluídas cedo demais em cenários de resposta lenta, erro operacional ou rate limit do agente.
- Decision: cada task do `taskloop` passa a ter um arquivo JSON de status em `.forgedesk/loops/<loopId>/tasks/`, e o prompt enviado ao agente instrui explicitamente a atualizar esse arquivo para `completed` ou `failed`.
- Consequences: a próxima task só começa quando a anterior estiver marcada de forma auditável em disco; timeouts de idle deixam de definir conclusão e falhas do agente não avançam a fila implicitamente.

## ADR-019 Retomada explícita de task falhada no task loop

- Status: Accepted
- Context: quando uma task falha, o operador precisa conseguir reexecutar exatamente a task corrente sem recriar todo o loop e sem perder o histórico já concluído.
- Decision: `resume` do `taskloop` passa a aceitar loops em estado `failed`, recria uma nova sessão de terminal para o loop, reseta o marcador JSON da task atual para `pending` e reinicia a execução a partir de `currentTaskIndex`.
- Consequences: tasks concluídas anteriormente permanecem auditáveis e não são repetidas; a UI pode oferecer "Retomar tarefa" após falha e o loop continua do ponto exato da interrupção.

## ADR-020 Update manual assistido pela UI

- Status: Accepted
- Context: a distribuição Linux atual é feita por AppImage, sem feed remoto de releases ou infraestrutura de auto-update, mas o operador ainda precisa substituir a instalação local com menos atrito e sem acessar filesystem manualmente.
- Decision: o processo principal expõe um fluxo IPC tipado para update manual assistido, disponível apenas quando a aplicação empacotada está rodando via AppImage; a UI abre um painel operacional que mostra o runtime atual, permite selecionar um novo AppImage via diálogo nativo, faz substituição atômica do binário em uso e oferece relaunch explícito após a troca.
- Consequences: o renderer continua sem acesso direto a filesystem, a atualização permanece auditável e local-first, e o produto ganha um caminho intermediário útil antes de adotar auto-update remoto.

## ADR-021 Diff e histórico sob demanda por arquivo selecionado

- Status: Accepted
- Context: o painel de mudanças estava carregando diff e histórico automaticamente sempre que havia alterações de arquivo, gerando consultas Git recorrentes e ocupando a área de inspeção sem uma seleção explícita do operador.
- Decision: o snapshot de projeto passa a carregar apenas os grupos de status Git; diff e histórico são buscados no renderer somente quando um arquivo modificado é clicado, e o painel vazio exibe uma instrução explícita para seleção.
- Consequences: o watcher deixa de provocar recargas contínuas de diff, o snapshot inicial fica mais leve e a UI passa a refletir melhor a intenção do operador ao inspecionar mudanças.

## ADR-022 Troca de agente ao retomar task loop interrompido

- Status: Accepted
- Context: loops podem parar no meio de uma task por falha operacional ou esgotamento de créditos do agente atual, e o operador precisa continuar a task corrente com outro agente sem recriar o loop inteiro.
- Decision: `resume` do `taskloop` passa a aceitar um `agent` opcional e também loops em estado `stopped`; ao retomar, o loop persiste o novo agente, reseta a task corrente para `pending` e cria uma nova sessão de terminal a partir de `currentTaskIndex`.
- Consequences: a UI pode oferecer troca explícita entre `claude` e `codex` na retomada, o histórico concluído permanece auditável e tasks interrompidas não ficam presas ao agente que falhou ou ficou sem créditos.
